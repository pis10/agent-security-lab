/**启动时拉一次当前厂商的模型目录；进程退出时收尾 MCP 子进程。 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __aslShutdownHook?: boolean };
  if (g.__aslShutdownHook) return;
  g.__aslShutdownHook = true;
  await import("./core/pi-runtime.ts")
    .then((m) => m.ensureRemoteCatalog())
    .catch((err) => console.warn("startup catalog refresh failed", err));
  const shutdown = () => {
    import("./world/manager.ts")
      .then((m) => m.getWorldManager().shutdown())
      .catch((err) => console.warn("shutdown hook failed", err));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
