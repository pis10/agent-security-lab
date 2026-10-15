/**领域错误，路由层映射成 HTTP 状态。 */

export class NotFoundError extends Error {}

export class BadRequestError extends Error {}

/**未登录或会话失效。 */
export class UnauthorizedError extends Error {}

/**已登录但无权操作（非管理员、须先改初始口令）。 */
export class ForbiddenError extends Error {}

/**同一资源上已有操作在进行（如上一条消息还没回复完）。 */
export class ConflictError extends Error {}

/**账号业务校验失败（用户名不合法、口令错误等），映射为 400。 */
export class AuthError extends Error {}
