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
  syncAgentModel,
} from "../core/agent.ts";
import { ProgressDB, USERS_DIR } from "../core/db.ts";
import { BadRequestError, ConflictError } from "../core/errors.ts";
import { requireLlm } from "../core/llm.ts";
import { SINKS } from "../core/sinks.ts";
import { defensesOf, ToolContext } from "../core/tools.ts";
import { Tracer } from "../core/trace.ts";
import type { Config } from "../lib/config.ts";
import { loadConfig } from "../lib/config.ts";
import type { ChatMessage, WorldInfo } from "../lib/contracts.ts";
import { requireScenario, SCENARIOS } from "../scenarios/index.ts";
import type { Target } from "../targets/base.ts";
import { findTarget, getTarget } from "../targets/registry.ts";
import { recordTurnProgress } from "./observations.ts";
import { TurnQueue } from "./turn-queue.ts";

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
  runStatus: "idle" | "queued" | "running";
  lastAccess: number;
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
    run_status: "idle",
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
  private _resettingUsers = new Set<number>();
  private _queue: TurnQueue;
  private _sweep: ReturnType<typeof setInterval>;
  private _turns = new Map<string, Promise<string>>();
  private _closing = false;

  constructor(config: Config, opts: WorldManagerOptions = {}) {
    this._config = config;
    this._usersDir = opts.usersDir ?? USERS_DIR;
    this.progress = opts.progress ?? getProgressDb();
    this._queue = new TurnQueue(config.maxConcurrentTurns);
    this._sweep = setInterval(
      () => {
        void this.evictIdle().catch((err) => console.error("world eviction failed", err));
      },
      Math.min(config.worldIdleMs, 60_000),
    );
    this._sweep.unref();
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

  /**账号重置期间禁止新操作；检查也放在锁内，覆盖已排队的请求。 */
  private _worldLock<T>(userId: number, targetId: string, fn: () => Promise<T>): Promise<T> {
    const check = () => {
      if (this._closing) throw new ConflictError("服务正在停止，请稍后重试");
      if (this._resettingUsers.has(userId)) throw new ConflictError("账号正在重置，请稍后再试");
    };
    check();
    return this._lock(worldKey(userId, targetId), async () => {
      check();
      return fn();
    });
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
    return this._worldLock(userId, targetId, () => this._ensureLocked(userId, targetId, root, scenarioId));
  }

  /**调用方持有世界锁；获取世界与后续操作必须在同一临界区，避免操作已销毁的实例。 */
  private async _ensureLocked(
    userId: number,
    targetId: string,
    root: string,
    scenarioId: string | null = null,
  ): Promise<World> {
    await requireLlm();
    const key = worldKey(userId, targetId);
    let world = this._worlds.get(key) ?? null;
    if (world === null) {
      const storedScenario = this._scenarioOf(key, root);
      const switching = scenarioId !== null && existsSync(root) && scenarioId !== storedScenario;
      const defenses = switching ? this._defensesOf(key, root) : null;
      if (switching) await this._teardown(key, root);
      world = await this._hydrate(userId, targetId, root, scenarioId);
      if (defenses) {
        world.ctx.state.defenses = defenses;
        this._saveMeta(world);
      }
      this._worlds.set(key, world);
    } else if (scenarioId !== null && scenarioId !== world.scenarioId) {
      this._assertIdle(world, "切换课程");
      const defenses = new Set(defensesOf(world.ctx));
      await this._teardown(key, root);
      world = await this._hydrate(userId, targetId, root, scenarioId);
      world.ctx.state.defenses = defenses;
      this._saveMeta(world);
      this._worlds.set(key, world);
    }
    world.lastAccess = Date.now();
    return world;
  }

  async setDefenses(userId: number, targetId: string, defenses: string[]): Promise<World> {
    const root = this._root(userId, targetId);
    const valid = new Set(getTarget(targetId).defenses.map((d) => d.id));
    const unknown = defenses.filter((d) => !valid.has(d));
    if (unknown.length > 0) {
      throw new BadRequestError(`unknown defenses: ${JSON.stringify([...unknown].sort())}`);
    }
    return this._worldLock(userId, targetId, async () => {
      const world = await this._ensureLocked(userId, targetId, root);
      this._assertIdle(world, "修改防护");
      world.ctx.state.defenses = new Set(defenses);
      this._saveMeta(world);
      return world;
    });
  }

  private async _teardown(key: string, root: string): Promise<void> {
    const world = this._worlds.get(key);
    if (world) await this._dispose(world);
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
    if (scenarioId !== null) requireScenario(scenarioId, targetId);
    return this._worldLock(userId, targetId, async () => {
      this._assertIdle(this._worlds.get(key), "重置");
      await requireLlm();
      const defenses = this._defensesOf(key, root);
      const boundScenario = scenarioId ?? this._scenarioOf(key, root);
      await this._teardown(key, root);
      const progressIds = boundScenario
        ? [boundScenario]
        : SCENARIOS.filter((s) => s.target === targetId).map((s) => s.id);
      this.progress.clearIds(userId, progressIds);
      const world = await this._ensureLocked(userId, targetId, root, boundScenario);
      world.ctx.state.defenses = defenses;
      this._saveMeta(world);
      return world;
    });
  }

  /**重置期间封住该账号的新操作，等待已有短操作结束，再统一检查对话是否仍在运行。 */
  async resetUser(userId: number): Promise<void> {
    const dir = this._worldsDir(userId);
    if (this._resettingUsers.has(userId)) throw new ConflictError("账号正在重置，请稍后再试");
    this._resettingUsers.add(userId);
    try {
      await Promise.all([...this._locks].filter(([key]) => key.startsWith(`u${userId}:`)).map(([, tail]) => tail));
      const live = [...this._worlds.values()].filter((w) => w.userId === userId);
      for (const w of live) this._assertIdle(w, "重置");
      const targetIds = new Set([...live.map((w) => w.targetId), ...this.list(userId).map((w) => w.target_id)]);
      for (const targetId of targetIds) {
        await this._teardown(worldKey(userId, targetId), path.join(dir, targetId));
      }
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      this.progress.clearUser(userId);
    } finally {
      this._resettingUsers.delete(userId);
    }
  }

  async chat(userId: number, targetId: string, message: string): Promise<string> {
    const root = this._root(userId, targetId);
    const { world, turn } = await this._worldLock(userId, targetId, async () => {
      const world = await this._ensureLocked(userId, targetId, root);
      this._assertIdle(world, "发送消息");
      world.busy = true;
      world.runStatus = "queued";
      const turn = this._chatWorld(world, message);
      this._turns.set(world.key, turn);
      return { world, turn };
    });
    try {
      return await turn;
    } finally {
      this._turns.delete(world.key);
    }
  }

  private async _chatWorld(world: World, message: string): Promise<string> {
    let capturedBefore = new Set<string>();
    const eventStart = world.tracer.events.length;
    let failed = false;
    let reply: string;
    let release: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      capturedBefore = new Set(Object.keys(this.progress.captured(world.userId)));
      release = await this._queue.acquire();
      world.runStatus = "running";
      timer = setTimeout(() => {
        timedOut = true;
        world.agent.abort();
      }, this._config.turnTimeoutMs);
      // 排队期间管理员可能改了模型设置：开跑前切到当前模型
      await syncAgentModel(world.agent);
      await world.agent.prompt(message);
      if (timedOut) throw new Error("turn timeout");
      if (world.agent.state.errorMessage) throw new Error(world.agent.state.errorMessage);
      if (endedOnToolResults(world.agent.state.messages)) {
        appendAssistantNote(world.agent, BUDGET_NOTE);
        world.tracer.record("note", { text: BUDGET_NOTE });
      }
      reply = lastAssistantText(world.agent.state.messages);
    } catch (err) {
      failed = true;
      console.error(`world ${world.key} chat turn interrupted`, err);
      reply = timedOut
        ? "[error] 本轮对话已超时并停止。已发生的工具调用保留在观测页，可缩短任务后重试。"
        : "[error] 这一轮助手没有跑完（目标侧中断）。可以重发一次，或到观测页查看这轮已发生的调用。";
      appendAssistantNote(world.agent, reply);
    } finally {
      try {
        this._syncChat(world);
        recordTurnProgress(world, this.progress, eventStart, failed, capturedBefore);
      } finally {
        if (timer) clearTimeout(timer);
        release?.();
        world.busy = false;
        world.runStatus = "idle";
        world.lastAccess = Date.now();
      }
    }
    return reply;
  }

  /**用 SDK 清空对话与队列，保留工具与提示词基线。工单、轨迹、外发与防护保留。 */
  async clearChat(userId: number, targetId: string): Promise<World> {
    const root = this._root(userId, targetId);
    return this._worldLock(userId, targetId, async () => {
      const world = await this._ensureLocked(userId, targetId, root);
      this._assertIdle(world, "清空对话");
      world.agent.reset();
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
    const root = this._root(userId, targetId);
    return this._worldLock(userId, targetId, async () => {
      const world = await this._ensureLocked(userId, targetId, root);
      this._assertIdle(world, "修改场景");
      return this._runAct(world, action, args);
    });
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

  /**页面仍在访问时保留世界；无人访问后落盘并关闭 MCP，下次访问重新恢复。 */
  async evictIdle(now = Date.now()): Promise<void> {
    if (this._closing) return;
    for (const [key, world] of this._worlds) {
      if (world.busy || now - world.lastAccess < this._config.worldIdleMs) continue;
      await this._lock(key, async () => {
        if (this._closing || this._resettingUsers.has(world.userId)) return;
        if (this._worlds.get(key) !== world || world.busy || now - world.lastAccess < this._config.worldIdleMs) return;
        this._syncChat(world);
        this._saveMeta(world);
        await this._dispose(world);
      });
    }
  }

  private async _dispose(world: World): Promise<void> {
    this._worlds.delete(world.key);
    try {
      await world.target.onSessionEnd?.(world.ctx);
    } catch (err) {
      console.warn(`world ${world.key} close failed`, err);
    } finally {
      world.tracer.close();
      SINKS.detachLog(world.key);
      SINKS.purgeSession(world.key);
    }
  }

  async shutdown(): Promise<void> {
    this._closing = true;
    clearInterval(this._sweep);
    this._queue.close();
    await Promise.allSettled([...this._locks.values()]);
    for (const world of this._worlds.values()) world.agent.abort();
    await Promise.allSettled([...this._turns.values()]);
    for (const world of this._worlds.values()) await this._dispose(world);
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
    try {
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
        runStatus: "idle",
        lastAccess: Date.now(),
      };
      this._saveMeta(world);
      this._syncChat(world);
      return world;
    } catch (error) {
      // 初始化尚未进入 _worlds，常规 teardown 找不到它；在这里收尾已启动的 MCP 与文件句柄。
      try {
        await target.onSessionEnd?.(ctx);
      } finally {
        tracer.close();
        SINKS.purgeSession(key);
        SINKS.detachLog(key);
      }
      throw error;
    }
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
      run_status: world.runStatus,
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
