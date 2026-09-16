/**MCP server B：harmless_sink。工具描述可被市场 UI 改写。stdio。 */
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
