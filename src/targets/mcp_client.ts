/**MCP 连接、超时、取消和子进程组收尾均交给 Pi。 */
import path from "node:path";
import { McpClient, StdioTransport } from "@earendil-works/pi-mcp";

export async function connectMcpServer(module: string): Promise<McpClient> {
  const client = new McpClient({ name: "asl-mcp-bridge", version: "1.0.0", requestTimeoutMs: 15_000 });
  try {
    await client.connect(
      new StdioTransport({
        command: process.execPath,
        args: [path.join(process.cwd(), "mcpservers", module)],
        inheritEnv: false,
      }),
    );
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
