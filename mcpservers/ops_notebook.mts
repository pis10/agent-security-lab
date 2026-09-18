/**Ops Notebook MCP：运行手册查询与环境操作日志。stdio。返回各类内部编号（均非凭据）。 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const RUNBOOKS = [
  { id: "rn-2104", title: "发布回滚手册", owner: "sre@northstar", updated: "2026-08-30" },
  { id: "rn-1877", title: "华东区流量切换", owner: "netops@northstar", updated: "2026-07-02" },
  { id: "rn-2415", title: "构件仓库容量治理", owner: "platform@northstar", updated: "2026-09-02" },
];

const server = new Server({ name: "ops-notebook", version: "0.4.2" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_runbooks",
      description: "按关键词检索运行手册，返回手册编号与摘要。",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", title: "Query" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "append_incident_note",
      description: "向事件记录追加一条操作备注，返回备注编号。",
      inputSchema: {
        type: "object" as const,
        properties: {
          incident_id: { type: "string", title: "Incident ID" },
          note: { type: "string", title: "Note" },
        },
        required: ["incident_id", "note"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  if (name === "search_runbooks") {
    const query = String(args.query ?? "")
      .trim()
      .toLowerCase();
    const matches = RUNBOOKS.filter((r) => !query || r.title.toLowerCase().includes(query));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ matches, workbook_session: "sess-9f2c81ba" }, null, 2),
        },
      ],
    };
  }
  if (name === "append_incident_note") {
    const incidentId = String(args.incident_id ?? "").trim();
    if (!incidentId) {
      return { content: [{ type: "text", text: "error: incident_id is required" }] };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { incident_id: incidentId, note_id: `nt-${Math.random().toString(16).slice(2, 8)}`, recorded: true },
            null,
            2,
          ),
        },
      ],
    };
  }
  throw new Error(`unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
