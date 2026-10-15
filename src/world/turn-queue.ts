import { ConflictError } from "../core/errors.ts";

/**进程内 FIFO，只限制同时运行的对话轮数。Agent 循环及取消仍由 Pi 负责。 */
export class TurnQueue {
  private active = 0;
  private pending: { resolve: (release: () => void) => void; reject: (error: Error) => void }[] = [];
  private closed = false;
  private limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }

  acquire(): Promise<() => void> {
    if (this.closed) return Promise.reject(new Error("服务正在停止"));
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.release);
    }
    if (this.pending.length >= 100) return Promise.reject(new ConflictError("排队人数已满，请稍后重试"));
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  private release = () => {
    const next = this.pending.shift();
    if (next) next.resolve(this.release);
    else this.active--;
  };

  close(): void {
    this.closed = true;
    for (const next of this.pending.splice(0)) next.reject(new Error("服务正在停止"));
  }
}
