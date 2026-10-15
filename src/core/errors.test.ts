import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError, httpErrorOf, NotFoundError, PasswordChangeRequiredError } from "./errors.ts";

test("领域错误按 httpStatus 映射，不依赖类身份", () => {
  assert.deepEqual(httpErrorOf(new NotFoundError("x")), { status: 404, body: { detail: "x" } });
  assert.deepEqual(httpErrorOf(new ConflictError("busy")), { status: 409, body: { detail: "busy" } });
  assert.deepEqual(httpErrorOf(new PasswordChangeRequiredError("改密")), {
    status: 403,
    body: { detail: "改密", code: "password_change_required" },
  });
  // 另一份模块实例里的同名错误类：只要带 httpStatus 就照样映射
  const foreign = Object.assign(new Error("other instance"), { httpStatus: 404 });
  assert.equal(httpErrorOf(foreign)?.status, 404);
});

test("第三方错误（如模型服务返回的 status）不当作领域错误", () => {
  assert.equal(httpErrorOf(Object.assign(new Error("upstream 401"), { status: 401 })), null);
  assert.equal(httpErrorOf(new Error("boom")), null);
  assert.equal(httpErrorOf("str"), null);
});
