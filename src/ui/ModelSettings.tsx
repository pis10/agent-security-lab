"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { api, errorText } from "./api";
import { AdminFrame } from "./components/AdminFrame";
import { Tag } from "./components/Badge";
import { Icon } from "./components/Icon";
import {
  type LlmCompat,
  type LlmKind,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmSettingsInput,
  type LlmSettingsView,
  type LlmTestResult,
  type Meta,
  type ProgressMap,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "./types";

const KINDS: { id: LlmKind; title: string; hint: string; icon: string }[] = [
  {
    id: "openai-completions",
    title: "OpenAI 兼容服务",
    hint: "自建或网关：vLLM、SGLang、Ollama、One API 等 /v1/chat/completions 接口",
    icon: "server",
  },
  {
    id: "anthropic-messages",
    title: "Anthropic 兼容服务",
    hint: "自建或网关提供的 /v1/messages 接口",
    icon: "server",
  },
  { id: "builtin", title: "内置厂商", hint: "从模型目录选择厂商与模型，只需填 API Key", icon: "globe" },
];

const THINKING_LABEL: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "最低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
};

const CATEGORY_TEXT: Record<string, string> = {
  authentication: "API Key 无效或没有权限",
  connection: "连不上服务：检查地址、端口和网络是否可达",
  model_not_found: "服务上找不到这个模型，核对模型 ID",
  tool_calling_config: "服务端没有开启工具调用（如 vLLM 需 --enable-auto-tool-choice 与对应的 --tool-call-parser）",
  context_limit: "超出服务端的上下文长度，调小「上下文长度」「最大输出」或换模型",
  rate_limit: "请求过于频繁或额度不足",
  timeout: "请求超时：服务太慢或没有响应",
  other: "其他错误",
};

const DEFAULTS: LlmSettingsInput = {
  kind: "openai-completions",
  provider: "",
  model: "",
  base_url: "",
  thinking: "off",
  temperature: 0.3,
  context_window: 128_000,
  max_tokens: 8192,
  compat: {},
  headers: {},
};

function toInput(view: LlmSettingsView | null): LlmSettingsInput {
  if (!view) return DEFAULTS;
  const { api_key_set: _set, api_key_hint: _hint, updated_at: _at, updated_by: _by, ...rest } = view;
  return rest;
}

function headersText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function parseHeaders(text: string): { headers: Record<string, string>; error: string | null } {
  const headers: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i <= 0) return { headers, error: `请求头格式应为「名称: 值」：${line}` };
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { headers, error: null };
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink mb-1.5">
        {label}
      </label>
      {children(id)}
      {hint && <div className="text-[12px] text-muted mt-1.5 leading-relaxed">{hint}</div>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {description && <p className="text-[12px] text-muted mt-1 leading-relaxed">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

type TriState = "auto" | "yes" | "no";
const tri = (v: boolean | undefined): TriState => (v === undefined ? "auto" : v ? "yes" : "no");
const fromTri = (v: TriState): boolean | undefined => (v === "auto" ? undefined : v === "yes");

function TestResult({ result }: { result: LlmTestResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} className="scroll-mb-20">
      <TestResultBody result={result} />
    </div>
  );
}

function TestResultBody({ result }: { result: LlmTestResult }) {
  if (!result.ok) {
    const category = result.error?.category ?? "other";
    return (
      <div role="status" className="rounded-lg border border-danger/25 bg-danger-soft px-4 py-3">
        <div className="flex items-center gap-2 text-[14px] font-medium text-danger">
          <Icon name="x" size={15} />
          连接失败 · {CATEGORY_TEXT[category] ?? CATEGORY_TEXT.other}
        </div>
        {result.error?.message && (
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[12px] text-ink-2">
            {result.error.message}
          </pre>
        )}
        <div className="mt-1 text-[12px] text-muted">
          {result.model} · {(result.latency_ms / 1000).toFixed(1)} 秒
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 ${result.tool_call ? "border-ok/25 bg-ok-soft" : "border-warn/25 bg-warn-soft"}`}
    >
      <div className={`flex items-center gap-2 text-[14px] font-medium ${result.tool_call ? "text-ok" : "text-warn"}`}>
        <Icon name={result.tool_call ? "check" : "alert-triangle"} size={15} />
        {result.tool_call ? "连接成功，模型能正常调用工具" : "能连通，但模型没有按要求调用工具"}
      </div>
      <div className="mt-1 text-[12px] text-ink-2 leading-relaxed">
        {result.model} · 耗时 {(result.latency_ms / 1000).toFixed(1)} 秒
        {!result.tool_call &&
          " · 靶场的每一关都依赖工具调用。请检查服务端是否开启了工具调用及对应解析器（如 vLLM 的 --enable-auto-tool-choice 与 --tool-call-parser），或换一个支持工具调用的模型。"}
      </div>
      {result.reply && <div className="mt-1.5 text-[12px] text-muted">模型回复：{result.reply}</div>}
    </div>
  );
}

export function ModelSettings({
  settings: initialSettings,
  providers,
  initialModels,
  meta,
  progress,
  scenarioCount,
}: {
  settings: LlmSettingsView | null;
  providers: LlmProviderInfo[];
  initialModels: LlmModelInfo[];
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSettings);
  const [form, setForm] = useState<LlmSettingsInput>(() => toInput(initialSettings));
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [headers, setHeaders] = useState(() => headersText(initialSettings?.headers ?? {}));
  const [models, setModels] = useState(initialModels);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LlmTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const custom = form.kind !== "builtin";
  const set = <K extends keyof LlmSettingsInput>(key: K, value: LlmSettingsInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
    setMessage(null);
  };
  const setCompat = (patch: Partial<LlmCompat>) => {
    const next: LlmCompat = { ...form.compat, ...patch };
    for (const key of Object.keys(next) as (keyof LlmCompat)[]) if (next[key] === undefined) delete next[key];
    set("compat", next);
  };

  // 服务（协议 + 厂商 + 地址）不变时沿用已保存的 Key，与服务端规则一致
  const sameService =
    !!saved &&
    saved.kind === form.kind &&
    (custom ? saved.base_url === form.base_url.trim().replace(/\/+$/, "") : saved.provider === form.provider);
  const keyKept = sameService && saved?.api_key_set && !clearKey && apiKey.trim() === "";

  useEffect(() => {
    if (form.kind !== "builtin" || !form.provider) return;
    let cancelled = false;
    api
      .llmModels(form.provider)
      .then((r) => {
        if (cancelled) return;
        setModels(r.models);
        setForm((f) => (r.models.some((m) => m.id === f.model) ? f : { ...f, model: r.models[0]?.id ?? "" }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.kind, form.provider]);

  const chooseKind = (kind: LlmKind) => {
    if (kind === form.kind) return;
    setForm((f) => ({
      ...f,
      kind,
      provider: kind === "builtin" ? f.provider || providers[0]?.id || "" : "",
      model: saved?.kind === kind ? saved.model : "",
      base_url: kind !== "builtin" && saved?.kind === kind ? saved.base_url : "",
    }));
    setResult(null);
    setMessage(null);
  };

  const payload = (): LlmSettingsInput | null => {
    const parsed = parseHeaders(headers);
    if (parsed.error) {
      setError(parsed.error);
      return null;
    }
    setError(null);
    return {
      ...form,
      headers: custom ? parsed.headers : {},
      api_key: apiKey.trim() || undefined,
      clear_api_key: custom && clearKey ? true : undefined,
    };
  };

  const test = async () => {
    const body = payload();
    if (!body) return;
    setTesting(true);
    setResult(null);
    try {
      setResult(await api.testLlm(body));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setTesting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = payload();
    if (!body) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await api.saveLlmSettings(body);
      setSaved(r.settings);
      setApiKey("");
      setClearKey(false);
      setMessage("已保存。新的对话轮次会使用这个模型，正在进行的一轮不受影响。");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const keyPlaceholder = keyKept
    ? `已设置 · 末四位 ${saved?.api_key_hint ?? "****"}，留空表示不修改`
    : custom
      ? "服务不校验 Key 可以留空"
      : "必填";

  return (
    <AdminFrame
      active="model"
      meta={meta}
      progress={progress}
      scenarioCount={scenarioCount}
      title="模型设置"
      description="靶场里所有产品的助手都使用这里配置的模型。保存前建议先测试连接，确认模型能调用工具。"
    >
      <div className="card px-5 py-4 mb-5 flex flex-wrap items-center gap-3">
        <span
          className={`h-9 w-9 rounded-lg flex items-center justify-center ${
            saved ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
          }`}
        >
          <Icon name={saved ? "cpu" : "alert-triangle"} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">
            {saved ? (
              <>
                当前模型 <span className="font-mono">{meta.llm_model}</span>
              </>
            ) : (
              "尚未配置模型，学员暂时无法和助手对话"
            )}
          </div>
          {saved && (
            <div className="text-[12px] text-muted mt-0.5">
              {saved.updated_by ? `${saved.updated_by} ` : ""}于{" "}
              {new Date(saved.updated_at * 1000).toLocaleString("zh-CN", { hour12: false })} 保存 · Key{" "}
              {saved.api_key_set ? `已设置（末四位 ${saved.api_key_hint ?? "****"}）` : "未设置"}
            </div>
          )}
        </div>
        {saved && <Tag tone="ok">已启用</Tag>}
      </div>

      <form onSubmit={save} className="space-y-5 max-w-3xl">
        <Section title="服务类型">
          <fieldset>
            <legend className="sr-only">服务类型</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {KINDS.map((k) => {
                const on = form.kind === k.id;
                return (
                  <label
                    key={k.id}
                    className={`relative flex flex-col gap-1.5 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      on ? "border-ink bg-sunken/60 ring-1 ring-ink" : "border-line hover:border-line-strong"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.id}
                      checked={on}
                      onChange={() => chooseKind(k.id)}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      <Icon name={k.icon} size={14} className={on ? "text-brand" : "text-muted"} />
                      {k.title}
                    </span>
                    <span className="text-[12px] text-muted leading-relaxed">{k.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {custom ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="服务地址"
                hint={
                  form.kind === "openai-completions"
                    ? "一般以 /v1 结尾，例如 http://10.0.0.5:8000/v1"
                    : "不带 /v1，例如 http://10.0.0.5:8000"
                }
              >
                {(id) => (
                  <input
                    id={id}
                    className="field font-mono"
                    value={form.base_url}
                    onChange={(e) => set("base_url", e.target.value)}
                    placeholder={
                      form.kind === "openai-completions" ? "http://10.0.0.5:8000/v1" : "http://10.0.0.5:8000"
                    }
                    required
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="模型 ID" hint="服务端的模型名，例如 qwen3-32b">
                {(id) => (
                  <input
                    id={id}
                    className="field font-mono"
                    value={form.model}
                    onChange={(e) => set("model", e.target.value)}
                    required
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="厂商">
                {(id) => (
                  <select
                    id={id}
                    className="field"
                    value={form.provider}
                    onChange={(e) => set("provider", e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="模型">
                {(id) => (
                  <select id={id} className="field" value={form.model} onChange={(e) => set("model", e.target.value)}>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.name !== m.id ? `（${m.id}）` : ""} · {Math.round(m.context_window / 1000)}K
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          )}

          <Field
            label="API Key"
            hint={
              saved?.api_key_set && !sameService
                ? "更换了服务，需要重新填写 Key；已保存的 Key 不会发往新的服务地址。"
                : "Key 只保存在服务器上，不会显示在页面里。"
            }
          >
            {(id) => (
              <input
                id={id}
                type="password"
                className="field font-mono"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setResult(null);
                }}
                placeholder={keyPlaceholder}
                autoComplete="new-password"
                disabled={clearKey}
              />
            )}
          </Field>
          {custom && saved?.api_key_set && sameService && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              这个服务不需要 Key，清除已保存的 Key
            </label>
          )}
        </Section>

        <Section
          title="生成参数"
          description="思考级别只对支持推理的模型生效；自建服务选了思考级别后会按推理模型发送请求。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="思考级别">
              {(id) => (
                <select
                  id={id}
                  className="field"
                  value={form.thinking}
                  onChange={(e) => set("thinking", e.target.value as ThinkingLevel)}
                >
                  {THINKING_LEVELS.map((t) => (
                    <option key={t} value={t}>
                      {THINKING_LABEL[t]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="温度" hint="0–2，靶场默认 0.3；越高越随机。">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  className="field"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => set("temperature", Number(e.target.value))}
                />
              )}
            </Field>
          </div>
        </Section>

        {custom && (
          <details className="card group">
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">高级选项</span>
                <span className="block text-[12px] text-muted mt-0.5">
                  上下文容量、兼容开关、额外请求头。服务报错时再调整。
                </span>
              </span>
              <Icon name="chevron-down" size={16} className="text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="上下文长度（token）" hint="与服务端实际容量一致，如 vLLM 的 --max-model-len。">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      className="field"
                      min={1024}
                      value={form.context_window}
                      onChange={(e) => set("context_window", Number(e.target.value))}
                    />
                  )}
                </Field>
                <Field label="最大输出（token）" hint="须小于上下文长度。">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      className="field"
                      min={1}
                      value={form.max_tokens}
                      onChange={(e) => set("max_tokens", Number(e.target.value))}
                    />
                  )}
                </Field>
              </div>
              {form.kind === "openai-completions" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="最大输出字段" hint="服务拒收 max_completion_tokens 时改为 max_tokens。">
                    {(id) => (
                      <select
                        id={id}
                        className="field"
                        value={form.compat.maxTokensField ?? "auto"}
                        onChange={(e) =>
                          setCompat({
                            maxTokensField:
                              e.target.value === "auto" ? undefined : (e.target.value as LlmCompat["maxTokensField"]),
                          })
                        }
                      >
                        <option value="auto">自动</option>
                        <option value="max_tokens">max_tokens</option>
                        <option value="max_completion_tokens">max_completion_tokens</option>
                      </select>
                    )}
                  </Field>
                  <Field label="store 字段" hint="服务拒收 store 参数时选「不发送」。">
                    {(id) => (
                      <select
                        id={id}
                        className="field"
                        value={tri(form.compat.supportsStore)}
                        onChange={(e) => setCompat({ supportsStore: fromTri(e.target.value as TriState) })}
                      >
                        <option value="auto">自动</option>
                        <option value="yes">发送</option>
                        <option value="no">不发送</option>
                      </select>
                    )}
                  </Field>
                  <Field label="developer 角色" hint="不认 developer 角色的服务选「不支持」，改用 system。">
                    {(id) => (
                      <select
                        id={id}
                        className="field"
                        value={tri(form.compat.supportsDeveloperRole)}
                        onChange={(e) => setCompat({ supportsDeveloperRole: fromTri(e.target.value as TriState) })}
                      >
                        <option value="auto">自动</option>
                        <option value="yes">支持</option>
                        <option value="no">不支持</option>
                      </select>
                    )}
                  </Field>
                  <Field label="思考参数格式" hint="开启思考级别时，按服务的格式传递，如 Qwen、DeepSeek。">
                    {(id) => (
                      <select
                        id={id}
                        className="field"
                        value={form.compat.thinkingFormat ?? "auto"}
                        onChange={(e) =>
                          setCompat({
                            thinkingFormat:
                              e.target.value === "auto" ? undefined : (e.target.value as LlmCompat["thinkingFormat"]),
                          })
                        }
                      >
                        <option value="auto">自动</option>
                        <option value="openai">OpenAI（reasoning_effort）</option>
                        <option value="qwen">Qwen（enable_thinking）</option>
                        <option value="qwen-chat-template">Qwen 聊天模板</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="chat-template">通用聊天模板</option>
                      </select>
                    )}
                  </Field>
                </div>
              )}
              <Field label="额外请求头" hint="每行一个「名称: 值」，例如网关要求的租户标识。">
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    className="field font-mono text-[12.5px]"
                    value={headers}
                    onChange={(e) => {
                      setHeaders(e.target.value);
                      setResult(null);
                    }}
                    placeholder="X-Tenant: lab"
                  />
                )}
              </Field>
            </div>
          </details>
        )}

        {result && <TestResult result={result} />}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-[13px] text-ok">
            {message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 sticky bottom-0 py-3 bg-paper/95 backdrop-blur border-t border-line">
          <button type="button" className="btn" onClick={test} disabled={testing || saving || !form.model}>
            <Icon name="zap" size={14} />
            {testing ? "测试中…" : "测试连接"}
          </button>
          <button type="submit" className="btn-primary" disabled={saving || testing || !form.model}>
            {saving ? "保存中…" : "保存"}
          </button>
          <span className="text-[12px] text-muted">测试不会保存配置，也不影响正在使用的模型。</span>
        </div>
      </form>
    </AdminFrame>
  );
}
