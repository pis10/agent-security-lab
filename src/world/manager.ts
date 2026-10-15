/**持久产品世界：每个账号每个靶标一个目录 data/runtime/users/<user_id>/worlds/<target_id>/，磁盘为准。 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import {
  appendAssistantNote,
  attachTracer,
  BUDGET_NOTE,
  createLabAgent,
  endedOnToolResults,
  lastAssistantText,
  looksLikePiTranscript,
  projectChat,
} from "../core/agent.ts";
import { ProgressDB, USERS_DIR } from "../core/db.ts";
import { BadRequestError, ConflictError } from "../core/errors.ts";
import { requireLlm } from "../core/pi-runtime.ts";
import { SINKS } from "../core/sinks.ts";
import { defensesOf, ToolContext } from "../core/tools.ts";
import { Tracer } from "../core/trace.ts";
import type { Config } from "../lib/config.ts";
import { loadConfig } from "../lib/config.ts";
import type { ChatMessage, WorldInfo } from "../lib/contracts.ts";
import { requireScenario, SCENARIOS } from "../scenarios/index.ts";
import type { Target } from "../targets/base.ts";
import { findTarget, getTarget } from "../targets/registry.ts";

export interface World {
  /**`u<user_id>:<target_id>`：轨迹、外发箱与 X-ASL-Session 的会话 id。 */
  key: string;
  userId: number;
  targetId: string;
  target: Target;
  ctx: ToolContext;
  agent: Agent;
  tracer: Tracer;
  scenarioId: string | null;
  created: number;
  /**聊天框内容，从 agent 回放历史投影。 */
  messages: ChatMessage[];
  /**正在跑一轮对话。 */
  busy: boolean;
}

interface WorldMeta {
  target_id?: string;
  created?: number;
  defenses?: string[];
  scenario_id?: string | null;
}

export function worldKey(userId: number, targetId: string): string {
  return `u${userId}:${targetId}`;
}

function metaPath(root: string): string {
  return path.join(root, "meta.json");
}

function transcriptPath(root: string): string {
  return path.join(root, "transcript.json");
}

function countJsonl(file: string): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim()) n += 1;
  }
  return n;
}

function readTranscript(root: string): AgentMessage[] | null {
  if (!existsSync(transcriptPath(root))) return null;
  const raw: unknown = JSON.parse(readFileSync(transcriptPath(root), "utf8"));
  return looksLikePiTranscript(raw) ? raw : null;
}

function diskSnapshot(root: string, targetId: string): WorldInfo | null {
  if (!existsSync(root)) return null;
  let meta: WorldMeta = { created: undefined, defenses: [], scenario_id: null };
  if (existsSync(metaPath(root))) {
    meta = { ...meta, ...(JSON.parse(readFileSync(metaPath(root), "utf8")) as WorldMeta) };
  }
  const saved = readTranscript(root);
  return {
    target_id: targetId,
    scenario_id: meta.scenario_id ?? null,
    created: meta.created ?? 0,
    enabled_defenses: meta.defenses ?? [],
    event_count: countJsonl(path.join(root, "trace.jsonl")),
    sink_count: countJsonl(path.join(root, "sinks.jsonl")),
    messages: saved ? projectChat(saved) : [],
  };
}

export interface WorldManagerOptions {
  /**各账号世界的根目录，默认 data/runtime/users。 */
  usersDir?: string;
  progress?: ProgressDB;
}

export class WorldManager {
  private _config: Config;
  private _usersDir: string;
  readonly progress: ProgressDB;
  private _worlds = new Map<string, World>();
  private _locks = new Map<string, Promise<unknown>>();

  constructor(config: Config, opts: WorldManagerOptions = {}) {
    this._config = config;
    this._usersDir = opts.usersDir ?? USERS_DIR;
    this.progress = opts.progress ?? getProgressDb();
  }

  /**按世界串行化 hydrate / teardown / 防护写入；不同账号、不同产品互不等待。 */
  private _lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this._locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this._locks.set(key, tail);
    void tail.then(() => {
      if (this._locks.get(key) === tail) this._locks.delete(key);
    });
    return run;
  }

  private _worldsDir(userId: number): string {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new BadRequestError(`账号 id 不合法：${userId}`);
    return path.join(this._usersDir, String(userId), "worlds");
  }

  /**世界目录。targetId 先过产品注册表，不让任意路径片段拼进文件系统。 */
  private _root(userId: number, targetId: string): string {
    getTarget(targetId);
    return path.join(this._worldsDir(userId), targetId);
  }

  private _assertIdle(world: World | null | undefined, what: string): void {
    if (world?.busy) throw new ConflictError(`助手正在回复，请等这一轮结束后再${what}`);
  }

  list(userId: number): WorldInfo[] {
    const dir = this._worldsDir(userId);
    const out: WorldInfo[] = [];
    const seen = new Set<string>();
    const onDisk = existsSync(dir)
      ? readdirSync(dir)
          .sort()
          .filter((child) => findTarget(child) !== null && statSync(path.join(dir, child)).isDirectory())
      : [];
    for (const targetId of onDisk) {
      const snap = diskSnapshot(path.join(dir, targetId), targetId);
      if (!snap) continue;
      seen.add(targetId);
      const w = this._worlds.get(worldKey(userId, targetId));
      out.push(w ? this._snapshot(w) : snap);
    }
    for (const w of this._worlds.values()) {
      if (w.userId === userId && !seen.has(w.targetId)) out.push(this._snapshot(w));
    }
    return out;
  }

  async ensure(userId: number, targetId: string, scenarioId: string | null = null): Promise<World> {
    const root = this._root(userId, targetId);
    if (scenarioId !== null) {
      requireScenario(scenarioId, targetId);
    }
    await requireLlm();
    const key = worldKey(userId, targetId);
    return this._lock(key, async () => {
      let world = this._worlds.get(key) ?? null;
      if (world === null) {
        world = await this._hydrate(userId, targetId, root, scenarioId);
        this._worlds.set(key, world);
      } else if (scenarioId !== null && scenarioId !== world.scenarioId) {
        // 换课：重建世界，防护开关保留
        this._assertIdle(world, "切换课程");
        const defenses = [...defensesOf(world.ctx)].sort();
        await this._teardown(key, root);
        world = await this._hydrate(userId, targetId, root, scenarioId);
        if (defenses.length > 0) {
          world.ctx.state.defenses = new Set(defenses);
          this._saveMeta(world);
        }
        this._worlds.set(key, world);
      }
      return world;
    });
  }

  async setDefenses(userId: number, targetId: string, defenses: string[]): Promise<World> {
    const world = await this.ensure(userId, targetId);
    const valid = new Set(world.target.defenses.map((d) => d.id));
    const unknown = defenses.filter((d) => !valid.has(d));
    if (unknown.length > 0) {
      throw new BadRequestError(`unknown defenses: ${JSON.stringify([...unknown].sort())}`);
    }
    return this._lock(world.key, async () => {
      world.ctx.state.defenses = new Set(defenses);
      this._saveMeta(world);
      return world;
    });
  }

  private async _teardown(key: string, root: string): Promise<void> {
    const world = this._worlds.get(key);
    if (world) {
      this._worlds.delete(key);
      try {
        await world.target.onSessionEnd?.(world.ctx);
      } catch (err) {
        console.error(`world ${key} onSessionEnd failed`, err);
      }
      world.tracer.close();
    }
    SINKS.purgeSession(key);
    SINKS.detachLog(key);
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }

  /**当前生效的防护集合：优先内存世界，其次磁盘 meta。 */
  private _defensesOf(key: string, root: string): Set<string> {
    const world = this._worlds.get(key);
    if (world) return new Set(defensesOf(world.ctx));
    const metaFile = metaPath(root);
    if (existsSync(metaFile)) {
      try {
        const meta = JSON.parse(readFileSync(metaFile, "utf8")) as WorldMeta;
        return new Set(meta.defenses ?? []);
      } catch {
        /* meta 读失败当作无防护 */
      }
    }
    return new Set();
  }

  /**当前绑定的课程：优先内存世界，其次磁盘 meta。 */
  private _scenarioOf(key: string, root: string): string | null {
    const world = this._worlds.get(key);
    if (world) return world.scenarioId;
    const metaFile = metaPath(root);
    if (existsSync(metaFile)) {
      try {
        return (JSON.parse(readFileSync(metaFile, "utf8")) as WorldMeta).scenario_id ?? null;
      } catch {
        /* meta 读失败当作未绑课 */
      }
    }
    return null;
  }

  async reset(userId: number, targetId: string, scenarioId: string | null = null): Promise<World> {
    // 清世界与当前课程的通关记录（未绑定课程时清该产品全部）；防护开关与课程绑定保留
    const root = this._root(userId, targetId);
    const key = worldKey(userId, targetId);
    const keep = await this._lock(key, async () => {
      this._assertIdle(this._worlds.get(key), "重置");
      const defenses = new Set(this._defensesOf(key, root));
      const boundScenario = scenarioId ?? this._scenarioOf(key, root);
      await this._teardown(key, root);
      return { defenses, boundScenario };
    });
    const progressIds = keep.boundScenario
      ? [keep.boundScenario]
      : SCENARIOS.filter((s) => s.target === targetId).map((s) => s.id);
    this.progress.clearIds(userId, progressIds);
    const world = await this.ensure(userId, targetId, keep.boundScenario);
    if (keep.defenses.size > 0) {
      await this._lock(key, async () => {
        world.ctx.state.defenses = keep.defenses;
        this._saveMeta(world);
      });
    }
    return world;
  }

  /**清掉该账号的全部产品世界与通关进度，回到刚打开靶场。其他账号不受影响。 */
  async resetUser(userId: number): Promise<void> {
    const dir = this._worldsDir(userId);
    const live = [...this._worlds.values()].filter((w) => w.userId === userId);
    for (const w of live) this._assertIdle(w, "重置");
    const targetIds = new Set([...live.map((w) => w.targetId), ...this.list(userId).map((w) => w.target_id)]);
    for (const targetId of targetIds) {
      const key = worldKey(userId, targetId);
      await this._lock(key, () => this._teardown(key, path.join(dir, targetId)));
    }
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    this.progress.clearUser(userId);
  }

  async chat(userId: number, targetId: string, message: string): Promise<string> {
    const world = await this.ensure(userId, targetId);
    // ensure 之后到这里没有 await：同一世界的并发请求只有一条能进
    if (world.busy) throw new ConflictError("上一条消息还在处理，请等助手回复后再发送");
    world.busy = true;
    let reply: string;
    try {
      await world.agent.prompt(message);
      if (endedOnToolResults(world.agent.state.messages)) {
        appendAssistantNote(world.agent, BUDGET_NOTE);
        world.tracer.record("note", { text: BUDGET_NOTE });
      }
      reply = lastAssistantText(world.agent.state.messages);
    } catch (err) {
      console.error(`world ${world.key} chat turn interrupted`, err);
      reply = "[error] 这一轮助手没有跑完（目标侧中断）。可以重发一次，或到观测页查看这轮已发生的调用。";
      appendAssistantNote(world.agent, reply);
    } finally {
      world.busy = false;
    }
    this._syncChat(world);
    return reply;
  }

  /**丢弃当前对话并整体重建 agent（不带历史）。工单、轨迹、外发与防护保留。 */
  async clearChat(userId: number, targetId: string): Promise<World> {
    const world = await this.ensure(userId, targetId);
    this._assertIdle(world, "清空对话");
    return this._lock(world.key, async () => {
      world.agent = await this._makeAgent(world.target, world.ctx, world.tracer);
      world.messages = [];
      this._syncChat(world);
      return world;
    });
  }

  async act(
    userId: number,
    targetId: string,
    action: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const world = await this.ensure(userId, targetId);
    return this._lock(world.key, () => this._runAct(world, action, args));
  }

  private async _runAct(world: World, action: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const actFn = world.target.act;
    if (!actFn) {
      throw new BadRequestError("该产品没有这项操作");
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
      } catch (err) {
        console.warn(`world ${world.key} shutdown failed`, err);
      }
    }
  }

  private async _hydrate(userId: number, targetId: string, root: string, scenarioId: string | null): Promise<World> {
    const target = getTarget(targetId);
    const key = worldKey(userId, targetId);
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

    const tracer = new Tracer({ sessionId: key, path: path.join(root, "trace.jsonl") });
    const ctx = new ToolContext(key, tracer, this._config);
    ctx.state.world_dir = root;
    ctx.state.defenses = new Set(meta.defenses);
    await target.seed?.(ctx);
    SINKS.attachLog(key, path.join(root, "sinks.jsonl"));
    await target.onSessionStart?.(ctx);
    const saved = readTranscript(root);
    const world: World = {
      key,
      userId,
      targetId,
      target,
      ctx,
      agent: await this._makeAgent(target, ctx, tracer, saved ?? undefined),
      tracer,
      scenarioId: meta.scenario_id ?? null,
      created: meta.created ?? Date.now() / 1000,
      messages: [],
      busy: false,
    };
    this._saveMeta(world);
    this._syncChat(world);
    return world;
  }

  private async _makeAgent(
    target: Target,
    ctx: ToolContext,
    tracer: Tracer,
    messages?: AgentMessage[],
  ): Promise<Agent> {
    const agent = await createLabAgent({
      systemPrompt: target.systemPrompt,
      tools: await target.buildTools(ctx),
      thinkingLevel: this._config.thinkingLevel,
      temperature: this._config.llmTemperature,
      messages,
    });
    attachTracer(agent, tracer);
    return agent;
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

  /**从 agent 回放历史投影聊天并写入 transcript.json。 */
  private _syncChat(world: World): void {
    world.messages = projectChat(world.agent.state.messages);
    const dir = world.ctx.state.world_dir as string;
    writeFileSync(transcriptPath(dir), `${JSON.stringify(world.agent.state.messages, null, 2)}\n`, "utf8");
  }

  private _snapshot(world: World): WorldInfo {
    return {
      target_id: world.targetId,
      scenario_id: world.scenarioId,
      created: world.created,
      enabled_defenses: [...defensesOf(world.ctx)].sort(),
      event_count: world.tracer.events.length,
      sink_count: SINKS.received({ sessionId: world.key }).length,
      messages: [...world.messages],
    };
  }
}

/**进程内单例。 */
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
