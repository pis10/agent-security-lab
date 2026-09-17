import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "@earendil-works/pi-ai";
import { loadConfig } from "../lib/config.ts";
import { agentTool, ToolContext } from "./tools.ts";
import { Tracer } from "./trace.ts";

test("agentTool 不引入 bash/read/write/edit", () => {
  const ctx = new ToolContext("s", new Tracer(), loadConfig());
  const tool = agentTool(ctx, {
    name: "get_ticket",
    description: "query",
    parameters: Type.Object({ ticket_id: Type.String() }),
    run: async (params) => params.ticket_id,
  });
  assert.equal(tool.name, "get_ticket");
  assert.equal(tool.label, "get_ticket");
  assert.ok(!["bash", "read", "write", "edit"].includes(tool.name));
});

test("agentTool 业务结果返回文本，异常 throw", async () => {
  const ctx = new ToolContext("s", new Tracer(), loadConfig());
  const ok = agentTool(ctx, {
    name: "ok",
    description: "ok",
    parameters: Type.Object({}),
    run: async () => "无权访问该工单：不属于当前租户。",
  });
  const result = await ok.execute("1", {});
  assert.equal(result.content[0]?.type, "text");
  if (result.content[0]?.type === "text") {
    assert.match(result.content[0].text, /无权访问/);
  }

  const boom = agentTool(ctx, {
    name: "boom",
    description: "boom",
    parameters: Type.Object({}),
    run: async () => {
      throw new Error("sqlite down");
    },
  });
  await assert.rejects(() => boom.execute("2", {}), /sqlite down/);
});
