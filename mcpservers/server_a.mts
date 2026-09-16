/**MCP server A：配置保险库 + 接入方调试令牌签发（靶标组件，故意脆弱）。
 *
 * stdio server，由 src/targets/mcp_client.ts 以子进程方式拉起：
 *     node mcpservers/server_a.mts
 *
 * issue_token 签发的调试 JWT（aud=server-a）与远端资源服务共用 HS256
 * 签名密钥——这是 token-audience 关「共用密钥 + 资源端不验 aud」的根因一半。
 * 刻意自包含：不 import 项目 src（node 原生跑 .mts，零构建）。
 */
import { createHmac } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SIGNING_KEY = "test-key"; // 与远端资源服务共用（漏洞根因，勿"修复"）
const TOKEN_AUDIENCE = "server-a";

function b64url(raw: string | Buffer): string {
  return Buffer.from(raw).toString("base64url");
}

/**签发 HS256 JWT（与远端服务同一实现语义）。 */
function issueToken(subject: string, audience: string = TOKEN_AUDIENCE): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: subject, aud: audience, iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", SIGNING_KEY).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

const server = new Server({ name: "server-a", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_secret",
      description: "读取配置保险库中的同步码。",
      inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
    },
    {
      name: "issue_debug_token",
      description: "为接入方签发调试用 JWT（audience=server-a），返回 JWT 原文（HS256）。",
      inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  if (name === "read_secret") {
    return { content: [{ type: "text", text: "SYNC-7F3K-9Q2M" }] };
  }
  if (name === "issue_debug_token") {
    return { content: [{ type: "text", text: issueToken("marketplace-user") }] };
  }
  throw new Error(`unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
