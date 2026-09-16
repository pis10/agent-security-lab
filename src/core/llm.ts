/**OpenAI-compatible chat client（默认：GLM Coding Plan / glm-5.3-flash），原生 fetch 实现。
 *
 * GLM reasoning 模型会返回 `reasoning_content`，且可能伴随 tool_calls 出现空
 * content——两者都在这里处理。`max_tokens` 给得宽裕，以防开启 thinking。
 * 远端挂住时 120s 快速失败、单次重试；不引 SDK。
 */
import type { Config } from "../lib/config.ts";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /**原始 JSON 字符串，重放 assistant 消息时需要 */
  argumentsJson: string;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  reasoning: string | null;
}

export interface LLM {
  chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse>;
}

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface WireMessage {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: WireToolCall[];
}

interface ChatCompletionResponse {
  choices?: { message?: WireMessage }[];
}

/**把 OpenAI-compatible 响应解析为 LLMResponse（独立成函数便于测试）。 */
export function parseChatResponse(data: ChatCompletionResponse): LLMResponse {
  const msg = data.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = [];
  for (const tc of msg.tool_calls ?? []) {
    const argsJson = tc.function?.arguments || "{}";
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      args = { _raw: argsJson };
    }
    toolCalls.push({
      id: tc.id ?? "",
      name: tc.function?.name ?? "",
      arguments: args,
      argumentsJson: argsJson,
    });
  }
  return {
    content: msg.content || null,
    toolCalls,
    reasoning: msg.reasoning_content ?? null,
  };
}

const RETRYABLE_STATUS = new Set([408, 429]);

export class LLMClient implements LLM {
  private _baseUrl: string;
  private _apiKey: string;
  private _model: string;
  private _maxTokens: number;
  private _temperature: number;
  private _thinking: string;

  constructor(config: Config, maxTokens = 8192) {
    this._baseUrl = config.llmBaseUrl.replace(/\/$/, "");
    this._apiKey = config.llmApiKey;
    this._model = config.llmModel;
    this._maxTokens = maxTokens;
    this._temperature = config.llmTemperature;
    this._thinking = config.llmThinking;
  }

  async chat(messages: unknown[], tools?: unknown[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this._model,
      messages,
      max_tokens: this._maxTokens,
      temperature: this._temperature,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    if (this._thinking) {
      // GLM 思考模式；留空则不发送（用于不认识该字段的端点）
      body.thinking = { type: this._thinking };
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(`${this._baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this._apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (exc) {
        if (exc instanceof Error && exc.name === "TimeoutError") {
          throw new Error(
            `LLM 请求超时（${this._model}）：端点无响应。可稍后重试；若持续超时，` +
              "检查 ASL_LLM_BASE_URL 是否为订阅对应的端点。",
          );
        }
        // 网络层异常（连接拒绝/重置等）：重试一次
        lastError = exc;
        if (attempt === 1) break;
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text();
        if (attempt === 0 && (resp.status >= 500 || RETRYABLE_STATUS.has(resp.status))) {
          continue; // 5xx/限流：重试一次
        }
        // 4xx（鉴权/请求不合法等）重试没有意义，立即失败
        throw new Error(`LLM ${resp.status}: ${text.slice(0, 300)}`);
      }
      return parseChatResponse((await resp.json()) as ChatCompletionResponse);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export function buildLlm(config: Config): LLM {
  return new LLMClient(config);
}
