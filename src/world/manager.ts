/**持久产品世界：每个靶标一个目录 data/runtime/worlds/<target_id>/，磁盘为准。 */
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
import { ProgressDB, WORLDS_DIR } from "../core/db.ts";
import { BadRequestError } from "../core/errors.ts";
import { requireLlm } from "../core/pi-runtime.ts";
import { SINKS } from "../core/sinks.ts";
import { defensesOf, ToolContext } from "../core/tools.ts";
import { Tracer } from "../core/trace.ts";
import type { Config } from "../lib/config.ts";
import { loadConfig } from "../lib/config.ts";
import type { ChatMessage, WorldInfo } from "../lib/contracts.ts";
import { requireScenario, SCENARIOS } from "../scenarios/index.ts";
import type { Target } from "../targets/base.ts";
import { getTarget } from "../targets/registry.ts";

export interface World {
  targetId: string;
  target: Target;
  ctx: ToolContext;
  agent: Agent;
  tracer: Tracer;
  scenarioId: string | null;
  created: number;
  /**聊天框内容，从 agent 回放历史投影。 */
  messages: ChatMessage[];
}

interface WorldMeta {
  target_id?: string;
  created?: number;
  defenses?: string[];
  scenario_id?: string | null;
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

export function diskSnapshot(targetId: string): WorldInfo | null {
  const root = path.join(WORLDS_DIR, targetId);
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

  /**串行化 hydrate / teardown / 防护写入。 */
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
    if (scenarioId !== null) {
      requireScenario(scenarioId, targetId);
    }
    await requireLlm();
    return this._lock(async () => {
      let world = this._worlds.get(targetId) ?? null;
      if (world === null) {
        world = await this._hydrate(targetId, scenarioId);
        this._worlds.set(targetId, world);
      } else if (scenarioId !== null && scenarioId !== world.scenarioId) {
        // 换课：重建世界，防护开关保留
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
      throw new BadRequestError(`unknown defenses: ${JSON.stringify([...unknown].sort())}`);
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
      } catch (err) {
        console.error(`world ${targetId} onSessionEnd failed`, err);
      }
      world.tracer.close();
    }
    SINKS.purgeSession(targetId);
    SINKS.detachLog(targetId);
    const root = path.join(WORLDS_DIR, targetId);
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }

  /**当前生效的防护集合：优先内存世界，其次磁盘 meta。 */
  private _defensesOf(targetId: string): Set<string> {
    const world = this._worlds.get(targetId);
    if (world) return new Set(defensesOf(world.ctx));
    const metaFile = metaPath(path.join(WORLDS_DIR, targetId));
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
  private _scenarioOf(targetId: string): string | null {
    const world = this._worlds.get(targetId);
    if (world) return world.scenarioId;
    const metaFile = metaPath(path.join(WORLDS_DIR, targetId));
    if (existsSync(metaFile)) {
      try {
        return (JSON.parse(readFileSync(metaFile, "utf8")) as WorldMeta).scenario_id ?? null;
      } catch {
        /* meta 读失败当作未绑课 */
      }
    }
    return null;
  }

  async reset(targetId: string, scenarioId: string | null = null): Promise<World> {
    // 清世界与该产品通关记录；防护开关与课程绑定保留（观测页/产品页重置行为一致）
    const keep = await this._lock(async () => {
      const defenses = new Set(this._defensesOf(targetId));
      const boundScenario = scenarioId ?? this._scenarioOf(targetId);
      await this._teardown(targetId);
      return { defenses, boundScenario };
    });
    getProgressDb().clearIds(SCENARIOS.filter((s) => s.target === targetId).map((s) => s.id));
    const world = await this.ensure(targetId, keep.boundScenario);
    if (keep.defenses.size > 0) {
      await this._lock(async () => {
        world.ctx.state.defenses = keep.defenses;
        this._saveMeta(world);
      });
    }
    return world;
  }

  /**全部产品世界 + 通关进度清掉，回到刚打开靶场。 */
  async resetAll(): Promise<void> {
    const ids = [...new Set(this.list().map((w) => w.target_id))];
    for (const id of ids) {
      await this._lock(async () => {
        await this._teardown(id);
      });
    }
    getProgressDb().clearAll();
  }

  async chat(targetId: string, message: string): Promise<string> {
    const world = await this.ensure(targetId);
    let reply: string;
    try {
      await world.agent.prompt(message);
      if (endedOnToolResults(world.agent.state.messages)) {
        appendAssistantNote(world.agent, BUDGET_NOTE);
        world.tracer.record("note", { text: BUDGET_NOTE });
      }
      reply = lastAssistantText(world.agent.state.messages);
    } catch (err) {
      console.error(`world ${targetId} chat turn interrupted`, err);
      reply = "[error] 这一轮助手没有跑完（目标侧中断）。可以重发一次，或到观测页查看这轮已发生的调用。";
      appendAssistantNote(world.agent, reply);
    }
    this._syncChat(world);
    return reply;
  }

  /**丢弃当前对话并整体重建 agent（不带历史）。工单、轨迹、外发与防护保留。 */
  async clearChat(targetId: string): Promise<World> {
    const world = await this.ensure(targetId);
    return this._lock(async () => {
      world.agent = await this._makeAgent(world.target, world.ctx, world.tracer);
      world.messages = [];
      this._syncChat(world);
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
        console.warn(`world ${world.targetId} shutdown failed`, err);
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

    const tracer = new Tracer({ sessionId: targetId, path: path.join(root, "trace.jsonl") });
    const ctx = new ToolContext(targetId, tracer, this._config);
    ctx.state.world_dir = root;
    ctx.state.defenses = new Set(meta.defenses);
    await target.seed?.(ctx);
    SINKS.attachLog(targetId, path.join(root, "sinks.jsonl"));
    await target.onSessionStart?.(ctx);
    const saved = readTranscript(root);
    const world: World = {
      targetId,
      target,
      ctx,
      agent: await this._makeAgent(target, ctx, tracer, saved ?? undefined),
      tracer,
      scenarioId: meta.scenario_id ?? null,
      created: meta.created ?? Date.now() / 1000,
      messages: [],
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

  private async _rebuildAgent(world: World): Promise<void> {
    const messages = world.agent.state.messages;
    world.agent = await this._makeAgent(world.target, world.ctx, world.tracer, messages);
    this._syncChat(world);
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
      sink_count: SINKS.received({ sessionId: world.targetId }).length,
      messages: [...world.messages],
    };
  }
}

function ctxFlag(ctx: ToolContext, key: string): boolean {
  return ctx.state[key] === true;
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
