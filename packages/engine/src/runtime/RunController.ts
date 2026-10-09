/**
 * 单次 run 的取消控制器。
 * 图节点通过 signal 感知取消；runtime 在循环里也会检查 aborted。
 */
export class RunController {
  readonly runId: string;
  readonly threadId: string;
  private readonly abort = new AbortController();

  constructor(runId: string, threadId: string) {
    this.runId = runId;
    this.threadId = threadId;
  }

  /** 传给模型请求 / 工具执行的 AbortSignal。 */
  get signal(): AbortSignal {
    return this.abort.signal;
  }

  /** 是否已被 cancel()。 */
  get aborted(): boolean {
    return this.abort.signal.aborted;
  }

  /** 取消本轮 run（中断 fetch / 工具遍历等）。 */
  cancel(): void {
    this.abort.abort();
  }
}
