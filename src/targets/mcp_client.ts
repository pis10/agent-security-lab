/**MCP stdio 客户端。close() 等待子进程退出。 */
import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**当前进程的直接子进程。容器里读 /proc。 */
function childProcesses(): Promise<Map<number, string>> {
  if (existsSync("/proc")) {
    const children = new Map<number, string>();
    for (const ent of readdirSync("/proc")) {
      if (!/^\d+$/.test(ent)) continue;
      try {
        const stat = readFileSync(`/proc/${ent}/stat`, "utf8");
        const m = /^\d+ \(.*?\) \S+ (\d+)/s.exec(stat);
        if (!m || m[1] !== String(process.pid)) continue;
        const cmdline = readFileSync(`/proc/${ent}/cmdline`, "utf8").replace(/\0/g, " ").trim();
        if (cmdline) children.set(Number.parseInt(ent, 10), cmdline);
      } catch {
        /* 进程已消失 */
      }
    }
    return Promise.resolve(children);
  }
  return new Promise((resolve, reject) => {
    exec("ps -eo pid=,ppid=,command=", { encoding: "utf8" }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      const me = String(process.pid);
      const children = new Map<number, string>();
      for (const line of stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[1] === me) {
          children.set(Number.parseInt(parts[0], 10), parts.slice(2).join(" "));
        }
      }
      resolve(children);
    });
  });
}

export class McpStdioClient {
  private _client: Client | null = null;
  private _module: string;
  private _timeoutMs: number;

  /**module：mcpservers/ 下的 server 脚本名（如 server_a.mts），亦用于 ps 识别。 */
  constructor(module: string, timeoutMs = 15000) {
    this._module = module;
    this._timeoutMs = timeoutMs;
  }

  async start(): Promise<void> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPathOf(this._module)],
    });
    const client = new Client({ name: "asl-mcp-bridge", version: "0.1.0" }, { capabilities: {} });
    try {
      await withTimeout(
        client.connect(transport),
        this._timeoutMs,
        `MCP server did not start in time: ${this._module}`,
      );
    } catch (err) {
      try {
        await client.close();
      } catch {
        /* already dead */
      }
      throw err;
    }
    this._client = client;
  }

  private _requireStarted(): Client {
    if (this._client === null) {
      throw new Error("McpStdioClient not started (or already closed)");
    }
    return this._client;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const client = this._requireStarted();
    const result = await withTimeout(client.listTools(), this._timeoutMs, `list_tools timed out: ${this._module}`);
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const client = this._requireStarted();
    const result = await withTimeout(
      client.callTool({ name, arguments: args }),
      this._timeoutMs,
      `call_tool ${name} timed out: ${this._module}`,
    );
    const content = (result.content ?? []) as Array<{ type?: string; text?: string }>;
    return content.map((c) => (typeof c.text === "string" ? c.text : JSON.stringify(c))).join("\n");
  }

  async close(): Promise<void> {
    if (this._client === null) return;
    const client = this._client;
    this._client = null;
    await client.close(); // 关闭 transport 并结束子进程
    await this._confirmExited();
  }

  /**确认子进程已退出；5 秒内仍在则抛错。 */
  private async _confirmExited(): Promise<void> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const children = await childProcesses();
      const leaked = [...children.entries()].filter(([, cmd]) => cmd.includes(this._module));
      if (leaked.length === 0) return;
      if (Date.now() > deadline) {
        throw new Error(`MCP server subprocess leaked: pid=${leaked[0][0]} (${this._module})`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

/**mcpservers/<module>，相对工作目录。 */
function serverPathOf(module: string): string {
  return path.join(process.cwd(), "mcpservers", module);
}
