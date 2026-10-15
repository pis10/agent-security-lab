/**只收尾已经创建的 manager，避免退出时初始化世界；类型导入不触发运行时文件追踪。 */
import type { WorldManager } from "../world/manager.ts";

export function registerShutdown(): void {
  const g = globalThis as { __aslShutdownHook?: boolean; __aslWorldManager?: WorldManager };
  if (g.__aslShutdownHook) return;
  g.__aslShutdownHook = true;
  const shutdown = () => {
    void g.__aslWorldManager?.shutdown().catch((err) => console.warn("shutdown hook failed", err));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
