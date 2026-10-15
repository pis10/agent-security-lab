/**仅暴露固定的报告执行接口；Docker socket 不挂进应用或执行容器。 */
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { Docker, stdoutOf, WORKER_LABEL, workerConfig } from "./docker.ts";
import { DEFAULT_SOCKET, MAX_REQUEST_BYTES, maxJobsOf, parseJob, type SandboxJob } from "./protocol.ts";

const docker = new Docker();
const imageName = process.env.ASL_SANDBOX_IMAGE;
if (!imageName) throw new Error("ASL_SANDBOX_IMAGE is required");
const maxJobs = maxJobsOf(process.env.ASL_SANDBOX_MAX_JOBS);
const image = (await docker.json("GET", `/images/${encodeURIComponent(imageName)}/json`)).Id as string;
const owner = process.env.ASL_SANDBOX_OWNER ?? "agent-security-lab";
const socket = process.env.ASL_SANDBOX_SOCKET ?? DEFAULT_SOCKET;
const active = new Set<string>();
let available = true;

// 重启后回收自己的残留容器，避免中断的命令继续留在后台。
const filters = encodeURIComponent(JSON.stringify({ label: [`${WORKER_LABEL}=${owner}`] }));
for (const container of await docker.json("GET", `/containers/json?all=1&filters=${filters}`)) {
  await docker.remove(container.Id);
}

async function execute(job: SandboxJob): Promise<string> {
  const name = `asl-exec-${randomUUID()}`;
  active.add(name);
  try {
    await docker.json("POST", `/containers/create?name=${name}`, workerConfig(image, owner, job));
    await docker.call("POST", `/containers/${name}/start`);
    const exited = await docker.json("POST", `/containers/${name}/wait?condition=not-running`);
    if (exited.StatusCode !== 0) throw new Error("Execution container failed");
    const logs = await docker.call("GET", `/containers/${name}/logs?stdout=1&stderr=0`);
    const result = JSON.parse(stdoutOf(logs));
    if (typeof result.output !== "string" || result.output.length > 4096) throw new Error("Invalid execution output");
    return result.output;
  } finally {
    try {
      await docker.remove(name);
    } catch (error) {
      // 404 表示创建失败或已经被 shutdown 回收；其他失败停止接新任务。
      if (!(error instanceof Error) || error.message !== "Docker HTTP 404") {
        available = false;
        console.error("Sandbox cleanup failed; restart broker after checking Docker");
      }
    }
    active.delete(name);
  }
}

const server = createServer(async (req, res) => {
  const respond = (status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health") return respond(available ? 200 : 503, { ready: available });
  if (req.method !== "POST" || req.url !== "/execute") return respond(404, { error: "Not found" });
  if (!available || active.size >= maxJobs) return respond(503, { error: "Sandbox busy or unavailable" });
  let job: SandboxJob;
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        respond(413, { error: "Request too large" });
        return;
      }
      chunks.push(chunk);
    }
    job = parseJob(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    respond(400, { error: "Invalid execution request" });
    return;
  }
  // 读取请求体期间可能已有其他请求占位，所以执行前再次检查。
  if (!available || active.size >= maxJobs) return respond(503, { error: "Sandbox busy or unavailable" });
  try {
    respond(200, { output: await execute(job) });
  } catch {
    respond(502, { error: "Sandbox execution failed" });
  }
});
server.requestTimeout = 3000;
server.headersTimeout = 3000;
server.maxConnections = maxJobs + 8;
mkdirSync(path.dirname(socket), { recursive: true, mode: 0o755 });
rmSync(socket, { force: true });
server.listen(socket, () => {
  chmodSync(socket, 0o666);
  console.info(`Sandbox broker ready (max ${maxJobs} jobs)`);
});

async function shutdown() {
  available = false;
  server.close();
  await Promise.allSettled([...active].map((name) => docker.remove(name)));
  rmSync(socket, { force: true });
  process.exit(0);
}
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
