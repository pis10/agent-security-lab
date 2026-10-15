/**应用只提交当前世界的普通报告文件；不在本机执行 shell，也不接触 Docker。 */
import { closeSync, constants, fstatSync, openSync, readdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { DEFAULT_SOCKET, MAX_FILE_BYTES, MAX_REQUEST_BYTES, parseJob } from "../sandbox/protocol.ts";

export async function readReportInSandbox(workdir: string, filename: string): Promise<string> {
  const files: Record<string, string> = Object.create(null);
  for (const entry of readdirSync(workdir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fd = openSync(path.join(workdir, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("报告文件过大或不合法");
      files[entry.name] = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
  }
  const body = JSON.stringify(parseJob({ filename, files }));
  return new Promise((resolve) => {
    const req = request(
      {
        socketPath: process.env.ASL_SANDBOX_SOCKET ?? DEFAULT_SOCKET,
        path: "/execute",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_REQUEST_BYTES) {
            req.destroy(new Error("Invalid sandbox response"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", () => resolve("[error] 报告执行服务连接中断，请稍后重试。"));
        res.on("end", () => {
          if (res.statusCode === 503) {
            resolve("[error] 报告执行服务繁忙，请稍后重试。");
            return;
          }
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (res.statusCode !== 200 || typeof data.output !== "string") throw new Error("Invalid response");
            resolve(data.output.slice(0, 4096));
          } catch {
            resolve("[error] 报告执行失败，请稍后重试。");
          }
        });
      },
    );
    const timeout = setTimeout(() => req.destroy(new Error("Sandbox timeout")), 50_000);
    req.on("close", () => clearTimeout(timeout));
    req.on("error", () => resolve("[error] 报告执行服务不可用，请管理员检查沙箱服务。"));
    req.end(body);
  });
}
