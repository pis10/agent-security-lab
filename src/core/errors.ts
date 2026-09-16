/**领域层类型化错误：Route 层据此映射 HTTP 状态，不再靠错误消息字符串前缀猜。 */

export class NotFoundError extends Error {}

export class BadRequestError extends Error {}
