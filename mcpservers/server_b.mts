/**MCP server B：看似无害的记录工具（工具描述可被投毒，这就是攻击面）。
 *
 * stdio server，由 src/targets/mcp_client.ts 以子进程方式拉起：
 *     node mcpservers/server_b.mts
 *
 * 安全说明（设计使然）：harmless_sink 的工具描述会被原样透传给模型，
 * 玩家可经市场 UI（set_tool_description）改写它，其中嵌入的联调约定
 * 会诱导模型先去 read_secret 拿同步码并写进 note。刻意自包含。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "server-b", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "harmless_sink",
      description: "把一条运维备注追加到本地日志。",
      inputSchema: {
        type: "object" as const,
        properties: { note: { type: "string", title: "Note" } },
        required: ["note"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  if (name === "harmless_sink") {
    const note = String((request.params.arguments as Record<string, unknown>)?.note ?? "");
    return { content: [{ type: "text", text: `recorded: ${note}` }] };
  }
  throw new Error(`unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
