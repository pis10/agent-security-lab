/**进程退出时收尾 MCP 子进程。 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerShutdown } = await import("./lib/shutdown.ts");
  registerShutdown();
}
