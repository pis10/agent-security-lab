/**固定 Docker API 1.45（Docker 26）；只有调度服务接触 daemon socket。 */
import { request } from "node:http";
import { JOB_TIMEOUT_MS, type SandboxJob } from "./protocol.ts";

export const WORKER_LABEL = "org.agent-security-lab.sandbox";
export function workerConfig(image: string, owner: string, job: SandboxJob) {
  return {
    Image: image,
    Entrypoint: ["/usr/local/bin/node", "/app/src/sandbox/worker.ts"],
    Cmd: [Buffer.from(JSON.stringify(job)).toString("base64")],
    User: "1000:1000",
    WorkingDir: "/work",
    Env: ["PATH=/usr/local/bin:/usr/bin:/bin"],
    NetworkDisabled: true,
    Labels: { [WORKER_LABEL]: owner },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 128 * 1024 * 1024,
      MemorySwap: 128 * 1024 * 1024,
      NanoCpus: 500_000_000,
      PidsLimit: 32,
      Tmpfs: { "/work": "rw,noexec,nosuid,nodev,size=1048576,uid=1000,gid=1000,mode=0700" },
      LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "1" } },
      Ulimits: [{ Name: "nofile", Soft: 128, Hard: 128 }],
    },
  };
}

export class Docker {
  readonly socketPath: string;
  constructor(socketPath = "/var/run/docker.sock") {
    this.socketPath = socketPath;
  }

  call(method: string, path: string, body?: unknown, timeout = JOB_TIMEOUT_MS): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        {
          socketPath: this.socketPath,
          method,
          path: `/v1.45${path}`,
          headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 256 * 1024) {
              req.destroy(new Error("Docker response too large"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`Docker HTTP ${res.statusCode}`));
              return;
            }
            resolve(Buffer.concat(chunks));
          });
        },
      );
      const deadline = setTimeout(() => req.destroy(new Error("Docker request timed out")), timeout);
      req.on("close", () => clearTimeout(deadline));
      req.on("error", reject);
      req.end(data);
    });
  }

  async json(method: string, path: string, body?: unknown): Promise<any> {
    const data = await this.call(method, path, body);
    return data.length ? JSON.parse(data.toString("utf8")) : null;
  }

  async remove(id: string): Promise<void> {
    await this.call("DELETE", `/containers/${encodeURIComponent(id)}?force=1&v=1`);
  }
}

/**Docker 非 TTY stdout/stderr 具有 8 字节帧头，不能把原始帧当 JSON 解析。 */
export function stdoutOf(frames: Buffer): string {
  const stdout: Buffer[] = [];
  for (let offset = 0; offset < frames.length; ) {
    if (offset + 8 > frames.length) throw new Error("Truncated Docker log frame");
    const length = frames.readUInt32BE(offset + 4);
    if (offset + 8 + length > frames.length) throw new Error("Truncated Docker log payload");
    if (frames[offset] === 1) stdout.push(frames.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return Buffer.concat(stdout).toString("utf8");
}
