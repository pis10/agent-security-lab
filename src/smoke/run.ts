import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, writeSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { activeLlm, requireLlm } from "../core/llm.ts";
import { SettingsDB, setSettingsDb } from "../core/settings.ts";
import { DEFAULT_SOCKET } from "../sandbox/protocol.ts";
import { SMOKE_CASES } from "./cases.ts";
import { type Sample, summarize } from "./results.ts";
import { runSmoke } from "./runner.ts";

const HELP = `模型自检：真实模型、真实工具、独立临时世界；每个样本结束后清理。
用法：pnpm smoke [--runs 3] [--scenario ticket-idor] [--timeout-ms 120000] [--output 文件.json]
容器：node src/smoke/run.ts [同上参数]

模型沿用管理员在网页「模型设置」保存的配置（data/runtime/settings.db）；--settings 可指定其他设置库。

每关依次跑 N 次无防护和 N 次有防护，L4 每次包含两轮独立聊天。
默认报告写入 data/runtime/smoke/；报告不包含 Key、模型回复、工具参数或凭据。
--scenario 可重复，只运行指定关卡。--timeout-ms 是每轮对话的时间限额。
退出码：0 全部符合预期；1 存在失败/未演示/错误/超时；2 配置失败或运行中断。
L2 需要可用的沙箱 socket；使用运行中的应用容器执行可沿用模型配置和沙箱。
`;

function positiveInteger(raw: string | undefined, fallback: number, max: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`参数须为 1–${max} 的整数`);
  return value;
}

async function checkSandbox(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = request({ socketPath: process.env.ASL_SANDBOX_SOCKET ?? DEFAULT_SOCKET, path: "/health" }, (res) => {
      res.resume();
      if (res.statusCode === 200) resolve();
      else reject(new Error("沙箱未就绪"));
    });
    req.on("error", () =>
      reject(new Error("L2 沙箱不可用。请在已挂载沙箱 socket 的应用容器运行，或用 --scenario 选择其他关卡。")),
    );
    req.setTimeout(3000, () => req.destroy(new Error("Sandbox timeout")));
    req.end();
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      runs: { type: "string" },
      scenario: { type: "string", multiple: true },
      "timeout-ms": { type: "string" },
      output: { type: "string" },
      settings: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return void console.log(HELP);
  const runs = positiveInteger(values.runs, 3, 100);
  const timeoutMs = positiveInteger(values["timeout-ms"], 120_000, 600_000);
  const ids = values.scenario ?? SMOKE_CASES.map((entry) => entry.id);
  const unknown = ids.filter((id) => !SMOKE_CASES.some((entry) => entry.id === id));
  if (unknown.length) throw new Error(`未知关卡：${unknown.join(", ")}`);
  const cases = SMOKE_CASES.filter((entry) => ids.includes(entry.id));
  if (values.settings) {
    if (!existsSync(values.settings)) throw new Error(`设置库不存在：${values.settings}`);
    setSettingsDb(new SettingsDB(values.settings));
  }
  const model = await requireLlm();
  if (ids.includes("cmd-injection")) await checkSandbox();
  const llm = activeLlm();
  const output = path.resolve(
    values.output ?? `data/runtime/smoke/${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  mkdirSync(path.dirname(output), { recursive: true });
  // 不覆盖已有文件。每完成一个样本就保存，进程中断后仍能查看已完成的结果。
  const fd = openSync(output, "wx", 0o600);
  const samples: Sample[] = [];
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    complete: false,
    model: {
      provider: model.provider,
      id: model.id,
      api: model.api,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      thinking: llm?.thinking,
      temperature: llm?.temperature,
    },
    runs,
    timeoutMs,
    scenarios: cases.map((entry) => entry.id),
    samples,
    summary: summarize(samples),
  };
  const save = () => {
    report.summary = summarize(samples);
    ftruncateSync(fd, 0);
    writeSync(fd, `${JSON.stringify(report, null, 2)}\n`, 0, "utf8");
  };
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  console.log(`模型：${model.provider}/${model.id}；${cases.length} 关 × ${runs} 次 × 2 种防护状态`);
  console.log(`报告：${output}`);
  try {
    save();
    await runSmoke({
      runs,
      timeoutMs,
      cases,
      signal: controller.signal,
      onStart: (scenario, run, defended) =>
        console.log(`${scenario} ${run}/${runs} ${defended ? "开启" : "关闭"}防护：运行中`),
      onSample: (sample) => {
        samples.push(sample);
        save();
        console.log(
          `  ${sample.outcome}，工具 ${sample.calls.length} 次，拦截 ${sample.blocks} 次，${(sample.durationMs / 1000).toFixed(1)} 秒`,
        );
        for (const error of sample.errors)
          console.log(`  错误分类：${error.stage}/${error.tool ?? "-"}/${error.category}`);
      },
    });
    report.complete = true;
    const expected = (sample: Sample) => sample.outcome === (sample.defended ? "blocked" : "passed");
    process.exitCode = samples.every(expected) ? 0 : 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    save();
    closeSync(fd);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    console.table(
      report.summary.map((row) => ({
        关卡: row.tier,
        通关率: `${row.attack.successes}/${row.attack.total} (${((row.attack.successes / row.attack.total) * 100 || 0).toFixed(0)}%)`,
        拦截率: row.defense.total
          ? `${row.defense.blocks}/${row.defense.total} (${((row.defense.blocks / row.defense.total) * 100).toFixed(0)}%)`
          : "未运行",
        防护绕过: row.bypasses,
        疑似模型拒绝: row.outcomes.model_declined,
        未演示: row.outcomes.not_demonstrated,
        错误: row.outcomes.error,
        超时: row.outcomes.timeout,
      })),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "自检未完成");
  process.exitCode = 2;
});
