/**显式运行 pnpm test:sandbox；仅操作本次测试创建的容器和卷。 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { promisify } from "node:util";
import { WORKER_LABEL } from "./docker.ts";

const exec = promisify(execFile);
const image = process.env.ASL_TEST_IMAGE ?? "agent-security-lab:sandbox-dev";
const owner = `asl-test-${randomUUID()}`;
const broker = `${owner}-broker`;
const ipc = `${owner}-ipc`;
async function docker(...args: string[]): Promise<string> {
  const { stdout } = await exec("docker", args, { timeout: 60_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
const client = `const http=require('http');const data=process.argv[1];const req=http.request({socketPath:'/run/asl-sandbox/execute.sock',path:'/execute',method:'POST',headers:{'content-type':'application/json'}},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>console.log(JSON.stringify({status:r.statusCode,body:JSON.parse(body)})));});req.on('error',()=>process.exit(1));req.end(data);`;
async function run(job: unknown) {
  return JSON.parse(await docker("exec", broker, "node", "-e", client, JSON.stringify(job))) as {
    status: number;
    body: { output?: string };
  };
}
async function read(filename: string, content = "CPU 正常\n") {
  const response = await run({ filename, files: { "report.txt": content } });
  assert.equal(response.status, 200);
  return response.body.output ?? "";
}
async function workers(): Promise<string[]> {
  return (await docker("ps", "-aq", "--filter", `label=${WORKER_LABEL}=${owner}`)).split("\n").filter(Boolean);
}
before(async () => {
  await docker("image", "inspect", image);
  await docker("volume", "create", ipc);
  await docker(
    "run",
    "-d",
    "--name",
    broker,
    "--network",
    "none",
    "--read-only",
    "--user",
    "0:0",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "128m",
    "--pids-limit",
    "64",
    "-e",
    `ASL_SANDBOX_IMAGE=${image}`,
    "-e",
    `ASL_SANDBOX_OWNER=${owner}`,
    "-e",
    "ASL_TEST_SECRET=must-not-enter-worker",
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "-v",
    `${ipc}:/run/asl-sandbox`,
    image,
    "node",
    "src/sandbox/broker.ts",
  );
  for (let i = 0; i < 30; i++) {
    if ((await docker("logs", broker)).includes("ready")) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Sandbox broker did not become ready");
});
after(async () => {
  await docker("rm", "-f", broker).catch(() => {});
  for (const id of await workers()) await docker("rm", "-f", id);
  await docker("volume", "rm", ipc).catch(() => {});
});

test("真实 cat/id，普通文件正常读取，注入发生在非 root 的执行容器", async () => {
  assert.equal(await read("report.txt"), "CPU 正常\n");
  assert.match(await read("report.txt; id"), /uid=1000/);
  assert.deepEqual(await workers(), []);
});

test("应用配置、Docker socket 和账号文件不可达；根目录只读、容器断网", async () => {
  const output = await read(
    "report.txt; printenv ASL_TEST_SECRET; test -S /var/run/docker.sock && echo SOCKET_LEAK; cat /app/data/runtime/accounts.db; touch /app/should-fail; node -e \"require('net').connect(80,'192.0.2.1').on('error',e=>console.log(e.code))\"",
  );
  assert.doesNotMatch(output, /must-not-enter-worker|SOCKET_LEAK/);
  assert.match(output, /No such file/);
  assert.match(output, /Read-only file system/);
  assert.match(output, /ENETUNREACH/);
});

test("每轮使用新容器：并发文件互不混用，上一轮写入和后台进程不残留", async () => {
  const [a, b] = await Promise.all([read("report.txt; sleep 1", "USER-A"), read("report.txt; sleep 1", "USER-B")]);
  assert.equal(a, "USER-A");
  assert.equal(b, "USER-B");
  await read("report.txt; echo old > /work/leftover; sleep 60 >/dev/null 2>&1 &");
  assert.match(await read("report.txt; cat /work/leftover"), /No such file/);
  assert.deepEqual(await workers(), []);
});

test("默认并发与对话并发一致：4 轮同时读报告都能执行，不报繁忙", async () => {
  const outputs = await Promise.all([1, 2, 3, 4].map((i) => read("report.txt; sleep 1", `JOB-${i}`)));
  assert.deepEqual(outputs, ["JOB-1", "JOB-2", "JOB-3", "JOB-4"]);
  assert.deepEqual(await workers(), []);
});

test("超时和输出上限终止命令，执行后无残留容器", async () => {
  assert.match(await read("report.txt; sleep 60"), /执行超时/);
  assert.match(await read("report.txt; yes x"), /输出超过限制/);
  assert.deepEqual(await workers(), []);
});

test("客户端不能设置 Docker 参数或用报告路径穿越文件投递目录", async () => {
  assert.equal((await run({ filename: "report.txt", files: {}, Image: "other" })).status, 400);
  assert.equal((await run({ filename: "report.txt", files: { "../escape": "bad" } })).status, 400);
  assert.equal((await run({ filename: "report.txt", files: { "big.txt": "x".repeat(40_000) } })).status, 400);
});

test("Docker 实际配置包含资源与权限限制，不挂载任何应用卷", async () => {
  const pending = read("report.txt; sleep 3");
  try {
    let ids: string[] = [];
    for (let i = 0; i < 30 && !ids.length; i++) {
      ids = await workers();
      if (!ids.length) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ids.length, 1);
    const [container] = JSON.parse(await docker("inspect", ids[0]));
    assert.equal(container.Config.User, "1000:1000");
    assert.equal(container.HostConfig.NetworkMode, "none");
    assert.equal(container.HostConfig.ReadonlyRootfs, true);
    assert.equal(container.HostConfig.PidsLimit, 32);
    assert.equal(container.HostConfig.Memory, 128 * 1024 * 1024);
    assert.deepEqual(container.HostConfig.CapDrop, ["ALL"]);
    assert.deepEqual(container.Mounts, []);
  } finally {
    await pending;
  }
});
