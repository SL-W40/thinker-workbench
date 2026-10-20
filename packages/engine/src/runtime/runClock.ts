/**
 * 一次 run 的计时锚点：engine 是 run 生命周期的权威方，墙钟只在这里起算。
 * 终态时换算成 `durationMs` 随事件下发，消费端不再自行推算。
 */
export type RunClock = {
  /** 进入执行阶段的时间戳（不含主进程排队）。 */
  startedAt: number;
  /** 主进程排队时长，原样并入终态耗时。 */
  queuedMs: number;
};

export function createRunClock(queuedMs?: number): RunClock {
  return {
    startedAt: Date.now(),
    queuedMs: Number.isFinite(queuedMs) ? Math.max(0, queuedMs as number) : 0,
  };
}
