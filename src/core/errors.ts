/**领域错误，路由层按 httpStatus 映射成 HTTP 状态。
 *
 * 路由层不用 instanceof 判断：开发模式下各路由各有一份模块实例，挂在 globalThis 上的单例
 * （世界管理器、账号库）抛出的错误类，与路由里 import 的不是同一个类。
 */
import { LLM_NOT_CONFIGURED, PASSWORD_CHANGE_REQUIRED } from "../lib/contracts.ts";

export abstract class LabError extends Error {
  abstract readonly httpStatus: number;
}

export class NotFoundError extends LabError {
  readonly httpStatus = 404;
}

export class BadRequestError extends LabError {
  readonly httpStatus = 400;
}

/**未登录或会话失效。 */
export class UnauthorizedError extends LabError {
  readonly httpStatus = 401;
}

/**已登录但无权操作（非管理员、须先改初始口令）。 */
export class ForbiddenError extends LabError {
  readonly httpStatus = 403;
}

/**还没改初始密码：除改密与查询本人外一律拒绝，前端据此跳改密页。 */
export class PasswordChangeRequiredError extends ForbiddenError {
  readonly code = PASSWORD_CHANGE_REQUIRED;
}

/**同一资源上已有操作在进行（如上一条消息还没回复完）。 */
export class ConflictError extends LabError {
  readonly httpStatus = 409;
}

/**管理员还没在网页上配置模型（或配置已不可用），前端据此引导去模型设置。 */
export class LlmNotConfiguredError extends LabError {
  readonly httpStatus = 503;
  readonly code = LLM_NOT_CONFIGURED;
}

/**账号业务校验失败（用户名不合法、口令错误等），映射为 400。 */
export class AuthError extends LabError {
  readonly httpStatus = 400;
}

/**领域错误的 HTTP 映射；其他错误返回 null。 */
export function httpErrorOf(err: unknown): { status: number; body: { detail: string; code?: string } } | null {
  if (!(err instanceof Error)) return null;
  const { httpStatus, code } = err as Error & { httpStatus?: unknown; code?: unknown };
  if (typeof httpStatus !== "number") return null;
  return {
    status: httpStatus,
    body: typeof code === "string" ? { detail: err.message, code } : { detail: err.message },
  };
}
