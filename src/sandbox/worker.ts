/**只在一次性执行容器中启动。进程结束后，调度器删除整个容器（包括遗留后台进程）。 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { EXECUTION_TIMEOUT_MS, MAX_OUTPUT_BYTES, parseJob } from "./protocol.ts";

const job = parseJob(JSON.parse(Buffer.from(process.argv[2] ?? "", "base64").toString("utf8")));
for (const [name, content] of Object.entries(job.files)) writeFileSync(`/work/${name}`, content, { mode: 0o600 });
// 故意保留拼接漏洞；文件和执行能力被限定在这个无网络、无数据卷的一次性容器内。
const child = spawn("/bin/sh", ["-c", `cat /work/${job.filename}`], {
  cwd: "/work",
  env: { PATH: "/usr/local/bin:/usr/bin:/bin", NODE_ENV: "production" },
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = Buffer.alloc(0);
let settled = false;
let timer: ReturnType<typeof setTimeout>;
function finish(note = "") {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  // 杀整个进程组；即使有子进程通过 setsid 脱离，容器销毁也会将它清理。
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* 已退出 */
    }
  }
  process.stdout.write(JSON.stringify({ output: output.toString("utf8").slice(0, 2000) + note }), () =>
    process.exit(0),
  );
}
function collect(chunk: Buffer) {
  const remaining = MAX_OUTPUT_BYTES - output.length;
  output = Buffer.concat([output, chunk.subarray(0, remaining)]);
  if (chunk.length > remaining) finish("\n[error] 输出超过限制，执行已终止。");
}
child.stdout.on("data", collect);
child.stderr.on("data", collect);
child.on("error", () => finish("\n[error] 无法启动报告读取进程。"));
child.on("close", () => finish());
timer = setTimeout(() => finish("\n[error] 执行超时，已终止。"), EXECUTION_TIMEOUT_MS);
