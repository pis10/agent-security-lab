import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { objSchema, strProp, ToolContext, ToolRegistry, toolParams, toolSchema } from "../src/core/tools.ts";
import { Tracer } from "../src/core/trace.ts";
import { loadConfig } from "../src/lib/config.ts";

test("objSchema 输出 strict object JSON Schema（无 $schema 头）", () => {
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

test("toolParams:argSchema 剥离未知键后交给 handler", async () => {
  let seen: Record<string, unknown> = {};
  const reg = new ToolRegistry([
    {
      name: "t",
      description: "",
      ...toolParams({ filename: strProp("f") }),
      handler: (args) => {
        seen = args;
        return "ok";
      },
    },
  ]);
  const out = await reg.call("t", { filename: "a.txt", extra: "junk" }, dummyCtx());
  assert.equal(out, "ok");
  assert.deepEqual(seen, { filename: "a.txt" });
});

test("toolParams:类型不符返回 [error] 文本给模型，handler 不执行", async () => {
  let executed = false;
  const reg = new ToolRegistry([
    {
      name: "t",
      description: "",
      ...toolParams({ n: z.number().describe("num") }),
      handler: () => {
        executed = true;
        return "ok";
      },
    },
  ]);
  const out = await reg.call("t", { n: "not-a-number" }, dummyCtx());
  assert.match(out, /\[error\] tool t 参数不合法/);
  assert.equal(executed, false);
});
