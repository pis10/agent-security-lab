/**真实 stdio 子进程测试；不调用外部模型。 */
import assert from "node:assert/strict";
import test from "node:test";
import { toLlmContent } from "@earendil-works/pi-mcp";
import { connectMcpServer } from "../targets/mcp_client.ts";

test("Pi MCP 管理独立进程：关闭一位学员的客户端不影响另一位", async () => {
  const a = await connectMcpServer("artifact_registry.mts");
  const b = await connectMcpServer("artifact_registry.mts");
  try {
    const tools = await a.listTools();
    assert.ok(tools.some((tool) => tool.name === "create_download_session"));
    await a.close();
    assert.equal(a.connectionState, "closed");
    await b.ping();
    const result = await b.callTool("create_download_session", { build_id: "bld-81c20" });
    assert.match(JSON.stringify(toLlmContent(result)), /access_token/);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
