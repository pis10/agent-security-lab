/**应用与执行调度器之间唯一允许的请求；不接受镜像、挂载、环境变量或 Docker 参数。 */
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_FILE_BYTES = 32 * 1024;
export const MAX_OUTPUT_BYTES = 32 * 1024;
export const EXECUTION_TIMEOUT_MS = 5000;
export const JOB_TIMEOUT_MS = 15_000;
export const DEFAULT_SOCKET = "/run/asl-sandbox/execute.sock";
export const DEFAULT_MAX_JOBS = 4;

/**同时执行的容器数。应与应用的 ASL_MAX_CONCURRENT_TURNS 一致：每轮工具串行，同时最多这么多次 read_report。 */
export function maxJobsOf(raw: string | undefined): number {
  const value = Number(raw ?? DEFAULT_MAX_JOBS);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("ASL_SANDBOX_MAX_JOBS must be a positive integer");
  return value;
}

export interface SandboxJob {
  filename: string;
  files: Record<string, string>;
}

export function parseJob(value: unknown): SandboxJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sandbox request");
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some((key) => !["filename", "files"].includes(key))) throw new Error("Unexpected job field");
  if (typeof obj.filename !== "string" || obj.filename.length > 4096 || obj.filename.includes("\0")) {
    throw new Error("Invalid filename");
  }
  if (!obj.files || typeof obj.files !== "object" || Array.isArray(obj.files)) throw new Error("Invalid files");
  const entries = Object.entries(obj.files);
  if (entries.length > 16) throw new Error("Too many files");
  for (const [name, content] of entries) {
    if (!/^[\p{L}\p{N}_.-]+$/u.test(name) || name === "." || name === ".." || name.length > 128) {
      throw new Error("Invalid report name");
    }
    if (typeof content !== "string" || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error("Report too large");
  }
  if (Buffer.byteLength(JSON.stringify(obj)) > MAX_REQUEST_BYTES) throw new Error("Request too large");
  return { filename: obj.filename, files: Object.fromEntries(entries) as Record<string, string> };
}
