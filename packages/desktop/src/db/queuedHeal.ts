/**
 * 启动 / 退出时如何处理残留的 queued。
 * 内存队列已经不在，不能 Resume，也不能把还在账本里的排队项清掉。
 */

/** 进程退出后内存队列消失，残留 queued 收成 failed 的说明。 */
export const QUEUE_CLEARED_ON_RESTART = "Queue was cleared because the app restarted.";

export type QueuedHealPlan =
  | { action: "keep" }
  | {
      action: "fail";
      runStatus: "failed";
      interruptReason: string;
      message: string;
    };

/** utility 闪退且账本仍持有队列时保留；否则收成 failed。 */
export function planQueuedHeal(preserveQueued: boolean): QueuedHealPlan {
  if (preserveQueued) return { action: "keep" };
  return {
    action: "fail",
    runStatus: "failed",
    interruptReason: QUEUE_CLEARED_ON_RESTART,
    message: QUEUE_CLEARED_ON_RESTART,
  };
}
