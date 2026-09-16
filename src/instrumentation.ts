/**Next instrumentation：nodejs runtime 启动时挂进程退出钩子。
 *
 * 世界状态本身全部落盘（trace/sinks/chat/meta 每次写入即持久化），
 * 这里只负责收尾 MCP 子进程等 live 资源——容器 SIGTERM 时干净退出。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __aslShutdownHook?: boolean };
  if (g.__aslShutdownHook) return;
  g.__aslShutdownHook = true;
  const shutdown = () => {
    import("./world/manager.ts")
      .then((m) => m.getWorldManager().shutdown())
      .catch((exc) => console.warn("shutdown hook failed", exc));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
