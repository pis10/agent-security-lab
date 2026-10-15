/**自定义模型端到端：本地模拟 OpenAI / Anthropic 协议服务，走 .env → Pi → 工具调用 → 回复的完整循环。 */
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, beforeEach } from "node:test";
import { Type } from "@earendil-works/pi-ai";
import { loadConfig, resetConfigCache } from "../lib/config.ts";
import { createLabAgent, lastAssistantText } from "./agent.ts";
import { resetPiModels } from "./pi-runtime.ts";
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

/**首轮返回 get_ticket 调用；带着工具结果的第二轮返回文本。 */
function openaiReply(body: Record<string, unknown>): string {
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
                function: { name: "get_ticket", arguments: '{"ticket_id":"T-2001"}' },
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
            content_block: { type: "tool_use", id: "toolu_1", name: "get_ticket", input: {} },
          },
        ],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"ticket_id":"T-2001"}' },
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

const ENV_KEYS = [
  "ASL_LLM_BASE_URL",
  "ASL_LLM_API",
  "ASL_LLM_MODEL",
  "ASL_LLM_API_KEY",
  "ASL_LLM_COMPAT",
  "ASL_LLM_PROVIDER",
];

beforeEach(() => {
  seen.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
});

/**按当前 .env 建靶场 Agent，跑一轮「查工单」。 */
async function runTicketTurn(env: Record<string, string>): Promise<{ args: unknown; reply: string }> {
  Object.assign(process.env, env);
  resetConfigCache();
  resetPiModels();
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
  const agent = await createLabAgent({
    systemPrompt: "你是客服助手。",
    tools: [tool],
    thinkingLevel: "off",
    temperature: 0.3,
  });
  await agent.prompt("帮我查询工单 T-2001");
  return { args, reply: lastAssistantText(agent.state.messages) };
}

test("OpenAI 协议：baseUrl 含 /v1，Bearer Key，工具调用往返", async () => {
  const { args, reply } = await runTicketTurn({
    ASL_LLM_BASE_URL: `${origin}/v1`,
    ASL_LLM_MODEL: "my-model",
    ASL_LLM_API_KEY: "test-key",
  });
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

test("OpenAI 协议：ASL_LLM_COMPAT 交给 Pi 调整请求字段；不填 Key 发占位值", async () => {
  const { reply } = await runTicketTurn({
    ASL_LLM_BASE_URL: `${origin}/v1`,
    ASL_LLM_MODEL: "my-model",
    ASL_LLM_COMPAT: '{"supportsStore":false,"maxTokensField":"max_tokens"}',
  });
  assert.match(reply, /tenant_b/);
  const first = seen[0];
  assert.equal(first.headers.authorization, "Bearer EMPTY");
  assert.ok(!("store" in first.body));
  assert.ok("max_tokens" in first.body);
  assert.ok(!("max_completion_tokens" in first.body));
});

test("Anthropic 协议：baseUrl 不含 /v1，x-api-key，工具调用往返", async () => {
  const { args, reply } = await runTicketTurn({
    ASL_LLM_BASE_URL: origin,
    ASL_LLM_API: "anthropic-messages",
    ASL_LLM_MODEL: "my-model",
    ASL_LLM_API_KEY: "test-key",
  });
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
