/**靶场 UI 的持久产品世界。
 *
 * 每个靶标一个目录：data/runtime/worlds/<target_id>/，跨进程重启留存；
 * 重置删除该目录并从 data/seeds/ 重新播种。磁盘是 source of truth，
 * 内存世界只是当前进程的 live 实例——globalThis 守卫只用于开发期 HMR
 * 不重建单例，任何业务正确性都不依赖它。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Agent } from "../core/agent.ts";
import { ProgressDB, WORLDS_DIR } from "../core/db.ts";
import { buildLlm } from "../core/llm.ts";
import { SINKS } from "../core/sinks.ts";
import { defensesOf, ToolContext, ToolRegistry } from "../core/tools.ts";
import { Tracer } from "../core/trace.ts";
import type { Config } from "../lib/config.ts";
import { llmAvailable, loadConfig } from "../lib/config.ts";
import type { Target } from "../targets/base.ts";
import { getTarget } from "../targets/registry.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface World {
  targetId: string;
  target: Target;
  ctx: ToolContext;
  agent: Agent;
  tracer: Tracer;
  scenarioId: string | null;
  created: number;
  messages: ChatMessage[];
}

interface WorldMeta {
  target_id?: string;
  created?: number;
  defenses?: string[];
  scenario_id?: string | null;
}

export interface WorldInfo {
  target_id: string;
  scenario_id: string | null;
  created: number;
  enabled_defenses: string[];
  event_count: number;
  sink_count: number;
  messages?: ChatMessage[];
}

function metaPath(root: string): string {
  return path.join(root, "meta.json");
}

function chatPath(root: string): string {
  return path.join(root, "chat.json");
}

function countJsonl(file: string): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim()) n += 1;
  }
  return n;
}

export function diskSnapshot(targetId: string): WorldInfo | null {
  const root = path.join(WORLDS_DIR, targetId);
  if (!existsSync(root)) return null;
  let meta: WorldMeta = { created: undefined, defenses: [], scenario_id: null };
  if (existsSync(metaPath(root))) {
    meta = { ...meta, ...(JSON.parse(readFileSync(metaPath(root), "utf8")) as WorldMeta) };
  }
  let messages: ChatMessage[] = [];
  if (existsSync(chatPath(root))) {
    messages = JSON.parse(readFileSync(chatPath(root), "utf8")) as ChatMessage[];
  }
  return {
    target_id: targetId,
    scenario_id: meta.scenario_id ?? null,
    created: meta.created ?? 0,
    enabled_defenses: meta.defenses ?? [],
    event_count: countJsonl(path.join(root, "trace.jsonl")),
    sink_count: countJsonl(path.join(root, "sinks.jsonl")),
    messages,
  };
}

function listDiskWorlds(): WorldInfo[] {
  if (!existsSync(WORLDS_DIR)) return [];
  const items: WorldInfo[] = [];
  for (const child of readdirSync(WORLDS_DIR).sort()) {
    if (statSync(path.join(WORLDS_DIR, child)).isDirectory()) {
      const snap = diskSnapshot(child);
      if (snap) items.push(snap);
    }
  }
  return items;
}

export class WorldManager {
  private _config: Config;
  private _worlds = new Map<string, World>();
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(config: Config) {
    this._config = config;
  }

  /**串行化结构性变更（hydrate/teardown/防护写入）。Node 单线程，但 await 间会交错。 */
  private _lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._queue.then(fn, fn);
    this._queue = run.catch(() => {});
    return run;
  }

  list(): WorldInfo[] {
    const live = new Map(this._worlds);
    const out: WorldInfo[] = [];
    const seen = new Set<string>();
    for (const snap of listDiskWorlds()) {
      seen.add(snap.target_id);
      const w = live.get(snap.target_id);
      if (w) {
        snap.enabled_defenses = [...defensesOf(w.ctx)].sort();
        snap.scenario_id = w.scenarioId;
        snap.event_count = w.tracer.events.length;
        snap.sink_count = SINKS.received({ sessionId: w.targetId }).length;
        snap.messages = [...w.messages];
      }
      out.push(snap);
    }
    for (const [tid, w] of live) {
      if (!seen.has(tid)) out.push(this._snapshot(w));
    }
    return out;
  }

  async ensure(targetId: string, scenarioId: string | null = null): Promise<World> {
    if (!llmAvailable(this._config)) {
      throw new Error("未配置 LLM Key:请复制 .env.example 为 .env 并填入 ASL_LLM_API_KEY。");
    }
    return this._lock(async () => {
      let world = this._worlds.get(targetId) ?? null;
      if (world === null) {
        world = await this._hydrate(targetId, scenarioId);
        this._worlds.set(targetId, world);
      } else if (scenarioId !== null && scenarioId !== world.scenarioId) {
        // 换课必须重置：断言按 target 维度查询 sink/trace，上一课留下的
        // 外发记录和投毒数据会污染这一课的判定。防护是玩家策略设置，
        // 跨重置保留（否则「开好防护再进课程」会被静默清掉）。
        const defenses = [...defensesOf(world.ctx)].sort();
        await this._teardown(targetId);
        world = await this._hydrate(targetId, scenarioId);
        if (defenses.length > 0) {
          world.ctx.state.defenses = new Set(defenses);
          this._saveMeta(world);
        }
        this._worlds.set(targetId, world);
      }
      return world;
    });
  }

  async setDefenses(targetId: string, defenses: string[]): Promise<World> {
    const world = await this.ensure(targetId);
    const valid = new Set(world.target.defenses.map((d) => d.id));
    const unknown = defenses.filter((d) => !valid.has(d));
    if (unknown.length > 0) {
      throw new Error(`unknown defenses: ${JSON.stringify([...unknown].sort())}`);
    }
    return this._lock(async () => {
      world.ctx.state.defenses = new Set(defenses);
      this._saveMeta(world);
      return world;
    });
  }

  private async _teardown(targetId: string): Promise<void> {
    const world = this._worlds.get(targetId);
    if (world) {
      this._worlds.delete(targetId);
      try {
        await world.target.onSessionEnd?.(world.ctx);
      } catch (exc) {
        // 收尾钩子失败不阻断清理（例如 MCP 泄漏校验抛错），但要看得见
        console.error(`world ${targetId} onSessionEnd failed`, exc);
      }
      world.tracer.close();
    }
    SINKS.purgeSession(targetId);
    SINKS.detachLog(targetId);
    const root = path.join(WORLDS_DIR, targetId);
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }

  private _defensesOf(targetId: string): Set<string> {
    /**当前生效的防护集合：优先内存世界，其次磁盘 meta。 */
    const world = this._worlds.get(targetId);
    if (world) return new Set(defensesOf(world.ctx));
    const metaFile = metaPath(path.join(WORLDS_DIR, targetId));
    if (existsSync(metaFile)) {
      try {
        const meta = JSON.parse(readFileSync(metaFile, "utf8")) as WorldMeta;
        return new Set(meta.defenses ?? []);
      } catch {
        // meta 不可读时按空防护处理
      }
    }
    return new Set();
  }

  async reset(targetId: string, scenarioId: string | null = null): Promise<World> {
    // 重置清投毒数据/痕迹，但保留防护开关（玩家策略层）：
    // 「开防护 → 重置 → 复测」是教学闭环的标准动作，防护丢失会打断它。
    const defenses = await this._lock(async () => {
      const d = new Set(this._defensesOf(targetId));
      await this._teardown(targetId);
      return d;
    });
    const world = await this.ensure(targetId, scenarioId);
    if (defenses.size > 0) {
      await this._lock(async () => {
        world.ctx.state.defenses = defenses;
        this._saveMeta(world);
      });
    }
    return world;
  }

  async chat(targetId: string, message: string): Promise<string> {
    const world = await this.ensure(targetId);
    world.messages.push({ role: "user", content: message });
    let reply: string;
    try {
      reply = await world.agent.run(message, world.ctx);
    } catch (exc) {
      // 中断的轮次也要收口：否则留下只有用户消息的半截对话，
      // 用户离开页面回来后就是一条永远没有回复的消息。
      console.error(`world ${targetId} chat turn interrupted`, exc);
      reply = "[error] 这一轮助手没有跑完（目标侧中断）。可以重发一次，或到观测页查看这轮已发生的调用。";
    }
    world.messages.push({ role: "assistant", content: reply });
    this._saveChat(world);
    return reply;
  }

  async clearChat(targetId: string): Promise<World> {
    /**丢弃当前对话并重建 agent。工单、轨迹、外发与防护保留。 */
    const world = await this.ensure(targetId);
    return this._lock(async () => {
      world.messages = [];
      await this._rebuildAgent(world);
      this._saveChat(world);
      return world;
    });
  }

  async act(targetId: string, action: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const world = await this.ensure(targetId);
    return this._lock(async () => {
      const result = await this._runAct(world, action, args);
      if (ctxFlag(world.ctx, "rebuild_agent")) {
        delete world.ctx.state.rebuild_agent;
        await this._rebuildAgent(world);
      }
      return result;
    });
  }

  private async _runAct(world: World, action: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const actFn = world.target.act;
    if (!actFn) {
      throw new Error("该产品没有这项操作");
    }
    return actFn(world.ctx, action, args);
  }

  snapshot(world: World): WorldInfo {
    return this._snapshot(world);
  }

  async shutdown(): Promise<void> {
    const worlds = [...this._worlds.values()];
    this._worlds.clear();
    for (const world of worlds) {
      try {
        await world.target.onSessionEnd?.(world.ctx);
        world.tracer.close();
      } catch (exc) {
        console.warn(`world ${world.targetId} shutdown failed`, exc);
      }
    }
  }

  private async _hydrate(targetId: string, scenarioId: string | null): Promise<World> {
    const target = getTarget(targetId);
    const root = path.join(WORLDS_DIR, targetId);
    mkdirSync(root, { recursive: true });
    let meta: Required<Pick<WorldMeta, "created" | "defenses" | "scenario_id">> = {
      created: Date.now() / 1000,
      defenses: [],
      scenario_id: scenarioId,
    };
    if (existsSync(metaPath(root))) {
      const stored = JSON.parse(readFileSync(metaPath(root), "utf8")) as WorldMeta;
      meta = {
        created: stored.created ?? meta.created,
        defenses: stored.defenses ?? meta.defenses,
        scenario_id: stored.scenario_id ?? meta.scenario_id,
      };
    }
    if (scenarioId !== null) meta.scenario_id = scenarioId;
    let messages: ChatMessage[] = [];
    if (existsSync(chatPath(root))) {
      messages = JSON.parse(readFileSync(chatPath(root), "utf8")) as ChatMessage[];
    }

    const tracer = new Tracer({ sessionId: targetId, path: path.join(root, "trace.jsonl") });
    const ctx = new ToolContext(targetId, tracer, this._config);
    ctx.state.world_dir = root;
    ctx.state.defenses = new Set(meta.defenses);
    await target.seed?.(ctx);
    SINKS.attachLog(targetId, path.join(root, "sinks.jsonl"));
    await target.onSessionStart?.(ctx);
    const world: World = {
      targetId,
      target,
      ctx,
      agent: await this._makeAgent(target, ctx, tracer),
      tracer,
      scenarioId: meta.scenario_id ?? null,
      created: meta.created ?? Date.now() / 1000,
      messages,
    };
    this._saveMeta(world);
    return world;
  }

  private async _makeAgent(target: Target, ctx: ToolContext, tracer: Tracer): Promise<Agent> {
    return new Agent(
      buildLlm(this._config),
      new ToolRegistry(await target.buildTools(ctx)),
      target.systemPrompt,
      tracer,
    );
  }

  private async _rebuildAgent(world: World): Promise<void> {
    world.agent = await this._makeAgent(world.target, world.ctx, world.tracer);
  }

  private _saveMeta(world: World): void {
    const payload = {
      target_id: world.targetId,
      created: world.created,
      defenses: [...defensesOf(world.ctx)].sort(),
      scenario_id: world.scenarioId,
    };
    writeFileSync(metaPath(world.ctx.state.world_dir as string), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private _saveChat(world: World): void {
    writeFileSync(
      chatPath(world.ctx.state.world_dir as string),
      `${JSON.stringify(world.messages, null, 2)}\n`,
      "utf8",
    );
  }

  private _snapshot(world: World): WorldInfo {
    return {
      target_id: world.targetId,
      scenario_id: world.scenarioId,
      created: world.created,
      enabled_defenses: [...defensesOf(world.ctx)].sort(),
      event_count: world.tracer.events.length,
      sink_count: SINKS.received({ sessionId: world.targetId }).length,
      messages: [...world.messages],
    };
  }
}

function ctxFlag(ctx: ToolContext, key: string): boolean {
  return ctx.state[key] === true;
}

/**dev 热重载下的进程级单例（磁盘才是真正的 source of truth）。 */
export function getWorldManager(): WorldManager {
  const g = globalThis as { __aslWorldManager?: WorldManager };
  if (!g.__aslWorldManager) {
    g.__aslWorldManager = new WorldManager(loadConfig());
  }
  return g.__aslWorldManager;
}

export function getProgressDb(): ProgressDB {
  const g = globalThis as { __aslProgressDb?: ProgressDB };
  if (!g.__aslProgressDb) {
    g.__aslProgressDb = new ProgressDB();
  }
  return g.__aslProgressDb;
}
