/**
 * 排队超时计时器：排队项超时视为 failed（可配置；0 表示不限时）。
 */
import { getQueueTimeoutMin, queueTimeoutError } from "../runCoordinator";
import type { OpenRun } from "./types";

/** 清除已挂的计时器。 */
export function clearTimer(entry: OpenRun): void {
  if (!entry.timer) return;
  clearTimeout(entry.timer);
  entry.timer = undefined;
}

/**
 * 为排队项挂超时计时器。
 * @param current 取当前条目（条目可能被重建 / 已结算）；不命中则放弃超时。
 * @param onTimeout 超时回调（由管理器 settle 为 failed 并广播合成终态）。
 */
export function armTimer(
  entry: OpenRun,
  current: (runId: string) => OpenRun | undefined,
  onTimeout: (error: string) => void,
): void {
  clearTimer(entry);
  const mins = getQueueTimeoutMin();
  if (mins <= 0) return;
  const seq = entry.seq;
  const runId = entry.runId;
  const timer = setTimeout(() => {
    const cur = current(runId);
    if (!cur || cur.settled || cur.phase !== "queued" || cur.seq !== seq) return;
    onTimeout(queueTimeoutError(mins));
  }, mins * 60_000);
  const unref = (timer as { unref?: () => void }).unref;
  if (typeof unref === "function") unref.call(timer);
  entry.timer = timer;
}
