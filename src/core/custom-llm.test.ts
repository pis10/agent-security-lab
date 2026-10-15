/**自建模型端到端：本地模拟 OpenAI / Anthropic 协议服务，走 网页设置 → Pi → 工具调用 → 回复的完整循环。 */
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, beforeEach } from "node:test";
import { Type } from "@earendil-works/pi-ai";
import { loadConfig } from "../lib/config.ts";
import { createLabAgent, lastAssistantText } from "./agent.ts";
import { type LlmSettings, testLlm } from "./llm.ts";
import { installTestLlm, TEST_LLM_DEFAULTS } from "./llm-testing.ts";
import { agentTool, ToolContext } from "./tools.ts";
import { Tracer } from "./trace.ts";

interface SeenRequest {
  path: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const seen: SeenRequest[] = [];

function sse(events: Array<[string | null, unknown]>): string {
  return events.map(([event, data]) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`).join("");
}

function openaiChunk(delta: Record<string, unknown>, finish: string | null): Record<string, unknown> {
  return {
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: "my-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

/**请求里声明的第一个工具及其测试参数。 */
function firstTool(names: string[]): { name: string; args: string } {
  const name = names[0] ?? "get_ticket";
  return { name, args: name === "ping" ? '{"value":42}' : '{"ticket_id":"T-2001"}' };
}

/**首轮返回对第一个工具的调用；带着工具结果的第二轮返回文本。 */
function openaiReply(body: Record<string, unknown>): string {
  const tool = firstTool(((body.tools ?? []) as Array<{ function: { name: string } }>).map((t) => t.function.name));
  const messages = body.messages as Array<{ role: string; content?: unknown }>;
  const toolResult = messages.find((m) => m.role === "tool");
  const usage = {
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: "my-model",
    choices: [],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
  const head = toolResult
    ? [
        openaiChunk({ role: "assistant", content: `查询结果：${String(toolResult.content)}` }, null),
        openaiChunk({}, "stop"),
      ]
    : [
        openaiChunk(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: tool.name, arguments: tool.args },
              },
            ],
          },
          null,
        ),
        openaiChunk({}, "tool_calls"),
      ];
  return `${sse([...head, usage].map((d) => [null, d]))}data: [DONE]\n\n`;
}

function anthropicReply(body: Record<string, unknown>): string {
  const tool = firstTool(((body.tools ?? []) as Array<{ name: string }>).map((t) => t.name));
  const messages = body.messages as Array<{ content: unknown }>;
  const result = messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .find((b: { type?: string }) => b.type === "tool_result") as { content?: unknown } | undefined;
  const start: [string, unknown] = [
    "message_start",
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "my-model",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
  ];
  const blocks: Array<[string, unknown]> = result
    ? [
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: `查询结果：${JSON.stringify(result.content)}` },
          },
        ],
      ]
    : [
        [
          "content_block_start",
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_1", name: tool.name, input: {} },
          },
        ],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: tool.args },
          },
        ],
      ];
  return sse([
    start,
    ...blocks,
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: result ? "end_turn" : "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ]);
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => {
    raw += c;
  });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    // 网关按路径路由、忽略查询串（Pi 的 Anthropic 客户端请求 /v1/messages?beta=true）
    const url = req.url ?? "";
    const pathname = new URL(url, "http://mock").pathname;
    seen.push({ path: pathname, url, headers: req.headers, body });
    if (req.headers.authorization === "Bearer bad-key-1234") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Incorrect API key provided: bad-key-1234" } }));
      return;
    }
    const payload =
      pathname === "/v1/chat/completions"
        ? openaiReply(body)
        : pathname === "/v1/messages"
          ? anthropicReply(body)
          : null;
    if (payload === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" }).end(payload);
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

beforeEach(() => {
  seen.length = 0;
});

function customLlm(overrides: Partial<LlmSettings>): LlmSettings {
  return {
    ...TEST_LLM_DEFAULTS,
    kind: "openai-completions",
    provider: "custom",
    model: "my-model",
    base_url: `${origin}/v1`,
    ...overrides,
  };
}

/**按当前模型设置建靶场 Agent，跑一轮「查工单」。 */
async function runTicketTurn(settings: LlmSettings): Promise<{ args: unknown; reply: string }> {
  installTestLlm(settings);
  const ctx = new ToolContext("s", new Tracer(), loadConfig());
  let args: unknown = null;
  const tool = agentTool(ctx, {
    name: "get_ticket",
    description: "按工单号查询工单详情。",
    parameters: Type.Object({ ticket_id: Type.String() }),
    run: (params) => {
      args = params;
      return '{"id":"T-2001","tenant":"tenant_b"}';
    },
  });
  const agent = await createLabAgent({ systemPrompt: "你是客服助手。", tools: [tool] });
  await agent.prompt("帮我查询工单 T-2001");
  return { args, reply: lastAssistantText(agent.state.messages) };
}

test("OpenAI 协议：baseUrl 含 /v1，Bearer Key，工具调用往返", async () => {
  const { args, reply } = await runTicketTurn(customLlm({ api_key: "test-key" }));
  assert.deepEqual(args, { ticket_id: "T-2001" });
  assert.match(reply, /tenant_b/);
  assert.deepEqual(
    seen.map((r) => r.path),
    ["/v1/chat/completions", "/v1/chat/completions"],
  );
  const first = seen[0];
  assert.equal(first.headers.authorization, "Bearer test-key");
  assert.equal(first.body.model, "my-model");
  assert.equal((first.body.tools as Array<{ function: { name: string } }>)[0].function.name, "get_ticket");
  // 自建服务地址 Pi 认不出厂商，按标准 OpenAI 发 store / max_completion_tokens
  assert.equal(first.body.store, false);
  assert.ok("max_completion_tokens" in first.body);
});

test("OpenAI 协议：兼容开关交给 Pi 调整请求字段；额外请求头原样发送；不填 Key 发占位值", async () => {
  const { reply } = await runTicketTurn(
    customLlm({
      compat: { supportsStore: false, maxTokensField: "max_tokens" },
      headers: { "X-Gateway-Tenant": "lab" },
    }),
  );
  assert.match(reply, /tenant_b/);
  const first = seen[0];
  assert.equal(first.headers.authorization, "Bearer EMPTY");
  assert.equal(first.headers["x-gateway-tenant"], "lab");
  assert.ok(!("store" in first.body));
  assert.ok("max_tokens" in first.body);
  assert.ok(!("max_completion_tokens" in first.body));
});

test("Anthropic 协议：baseUrl 不含 /v1，x-api-key，工具调用往返", async () => {
  const { args, reply } = await runTicketTurn(
    customLlm({ kind: "anthropic-messages", base_url: origin, api_key: "test-key" }),
  );
  assert.deepEqual(args, { ticket_id: "T-2001" });
  assert.match(reply, /tenant_b/);
  assert.deepEqual(
    seen.map((r) => r.path),
    ["/v1/messages", "/v1/messages"],
  );
  const first = seen[0];
  assert.equal(first.url, "/v1/messages?beta=true");
  assert.equal(first.headers["x-api-key"], "test-key");
  assert.equal(first.body.model, "my-model");
  assert.equal((first.body.tools as Array<{ name: string }>)[0].name, "get_ticket");
});

test("测试连接：工具调用往返成功；不保存设置，也不影响当前模型", async () => {
  installTestLlm(null);
  for (const settings of [
    customLlm({ api_key: "test-key" }),
    customLlm({ kind: "anthropic-messages", base_url: origin, api_key: "test-key" }),
  ]) {
    const result = await testLlm(settings);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.tool_call, true);
    assert.equal(result.model, "custom/my-model");
    assert.equal(result.error, null);
  }
  assert.equal((seen[0].body.tools as Array<{ function: { name: string } }>)[0].function.name, "ping");
});

test("测试连接：Key 错误归为 authentication，错误信息里不回显 Key；连不上归为 connection", async () => {
  const denied = await testLlm(customLlm({ api_key: "bad-key-1234" }));
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.category, "authentication");
  assert.doesNotMatch(denied.error?.message ?? "", /bad-key-1234/);
  const down = await testLlm(customLlm({ base_url: "http://127.0.0.1:9/v1" }), 5_000);
  assert.equal(down.ok, false);
  assert.equal(down.error?.category, "connection", down.error?.message);
});
