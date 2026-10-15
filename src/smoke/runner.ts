/**独立进程中的模型自检。临时用户目录/进度库，不访问应用账号库。 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lastAssistantText } from "../core/agent.ts";
import { ProgressDB } from "../core/db.ts";
import { evaluate } from "../core/flags.ts";
import { SINKS } from "../core/sinks.ts";
import { loadConfig } from "../lib/config.ts";
import { WorldManager } from "../world/manager.ts";
import type { SMOKE_CASES } from "./cases.ts";
import { classify, errorCategory, executionFailures, type Failure, type Sample } from "./results.ts";
import { startServices } from "./server.ts";

export interface SmokeOptions {
  runs: number;
  timeoutMs: number;
  cases: typeof SMOKE_CASES;
  signal?: AbortSignal;
  onStart?: (scenario: string, run: number, defended: boolean) => void;
  onSample?: (sample: Sample) => void;
}

export async function runSmoke(options: SmokeOptions): Promise<Sample[]> {
  const root = mkdtempSync(path.join(tmpdir(), "asl-smoke-"));
  const config = loadConfig();
  const originalPort = config.port;
  let services: Awaited<ReturnType<typeof startServices>> | undefined;
  let manager: WorldManager | undefined;
  const samples: Sample[] = [];
  try {
    services = await startServices();
    // 工具与 JWKS 校验共用配置；只修改当前 smoke 进程的端口。
    config.port = services.port;
    manager = new WorldManager(config, {
      usersDir: path.join(root, "users"),
      progress: new ProgressDB(path.join(root, "progress.db")),
    });
    for (const entry of options.cases) {
      for (let run = 1; run <= options.runs; run++) {
        for (const defended of [false, true]) {
          options.signal?.throwIfAborted();
          options.onStart?.(entry.id, run, defended);
          const started = Date.now();
          let world: Awaited<ReturnType<WorldManager["ensure"]>> | undefined;
          let timedOut = false;
          let error = false;
          const failures: Failure[] = [];
          const replies: string[] = [];
          const defenses = entry.scenario.defenses.map((d) => d.id);
          try {
            world = await manager.ensure(1, entry.scenario.target, entry.id);
            await manager.setDefenses(1, world.targetId, defended ? defenses : []);
            if (entry.email) await manager.act(1, world.targetId, "import_email", entry.email);
            for (const [index, prompt] of [entry.prompt, entry.followUp].entries()) {
              if (!prompt) continue;
              options.signal?.throwIfAborted();
              if (index > 0) await manager.clearChat(1, world.targetId);
              const agent = world.agent;
              const offset = agent.state.messages.length;
              const abort = () => agent.abort();
              options.signal?.addEventListener("abort", abort, { once: true });
              const timer = setTimeout(() => {
                timedOut = true;
                agent.abort();
              }, options.timeoutMs);
              try {
                await agent.prompt(prompt);
                replies.push(lastAssistantText(agent.state.messages.slice(offset)));
                if (agent.state.errorMessage) error = true;
              } finally {
                clearTimeout(timer);
                options.signal?.removeEventListener("abort", abort);
              }
              if (timedOut || error) break;
            }
          } catch (cause) {
            error = true;
            failures.push({
              stage: world ? "model" : "setup",
              category: errorCategory(cause instanceof Error ? cause.message : ""),
            });
          }
          options.signal?.throwIfAborted();
          const events = world?.tracer.events ?? [];
          failures.push(...executionFailures(events));
          const checks = world ? evaluate(entry.scenario.assertions, world.tracer, SINKS, world.key) : [];
          const passed = checks.length > 0 && checks.every((check) => check.passed);
          const blocks = events.filter(
            (e) => e.kind === "policy_blocked" && defenses.includes(String(e.data.defense)),
          ).length;
          const sample: Sample = {
            scenario: entry.id,
            tier: entry.scenario.tier,
            run,
            defended,
            passed,
            blocks,
            outcome: classify({ passed, blocks, error: error || failures.length > 0, timedOut, replies }),
            calls: events.filter((e) => e.kind === "tool_call").map((e) => String(e.data.name)),
            durationMs: Date.now() - started,
            errors: failures,
          };
          samples.push(sample);
          options.onSample?.(sample);
          // 每个样本重建全部产品状态；L4 的两轮之间只清空聊天，保留记忆。
          await manager.resetUser(1);
        }
      }
    }
    return samples;
  } finally {
    try {
      await manager?.resetUser(1);
      await manager?.shutdown();
    } finally {
      await services?.close();
      config.port = originalPort;
      rmSync(root, { recursive: true, force: true });
    }
  }
}
