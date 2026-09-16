import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { objSchema, strProp, ToolContext, ToolRegistry, toolSchema } from "../src/core/tools.ts";
import { Tracer } from "../src/core/trace.ts";
import { loadConfig } from "../src/lib/config.ts";

test("objSchema 输出与旧版 Python obj_schema 逐字节一致", () => {
  const schema = objSchema({ filename: strProp("要查看的文件名") });
  assert.deepEqual(schema, {
    type: "object",
    properties: { filename: { type: "string", description: "要查看的文件名" } },
    required: ["filename"],
    additionalProperties: false,
  });
  assert.equal("$schema" in schema, false);
});

test("optional 字段不进 required", () => {
  const schema = objSchema({
    to: strProp("a"),
    confirm: z.boolean().describe("x").optional(),
  });
  assert.deepEqual((schema as { required: string[] }).required, ["to"]);
});

test("toolSchema 包装成 OpenAI function 格式", () => {
  const s = toolSchema({
    name: "run_script",
    description: "d",
    parameters: objSchema({ filename: strProp("f") }),
    handler: () => "ok",
  });
  assert.equal(s.type, "function");
  assert.equal((s.function as { name: string }).name, "run_script");
});

test("Registry:未知工具与抛错工具都返回 [error] 文本给模型", async () => {
  const reg = new ToolRegistry([
    {
      name: "boom",
      description: "",
      parameters: objSchema({}),
      handler: () => {
        throw new Error("炸了");
      },
    },
  ]);
  assert.match(await reg.call("nope", {}, dummyCtx()), /^\[error\] unknown tool/);
  const out = await reg.call("boom", {}, dummyCtx());
  assert.match(out, /\[error\] tool boom failed: 炸了/);
});

function dummyCtx() {
  return new ToolContext("t", new Tracer({ sessionId: "t" }), loadConfig());
}
