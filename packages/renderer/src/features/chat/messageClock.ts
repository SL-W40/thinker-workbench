/**
 * 消息级计时：一次 run 的耗时只有一个真相——引擎在终态事件里下发的 `durationMs`。
 *
 * 这里只做两件事：
 * - 终态：写入引擎给的值（没有就保持「未知」，UI 展示「—」），并清掉 live 计时字段；
 * - hydrate：冻结历史快照，**不做任何推断**（以前会从时间线的 status 步反推，
 *   而工具步根本没记耗时，于是失败 run 的耗时被系统性压成 0）。
 */
import type { ChatMessage } from "@thinker-workbench/shared";
import { isSoftStopCode } from "./runErrors";
import { appendError, freezeTimelineHistory, stripQueuedWait } from "./timelineModel";

/**
 * 终态写耗时：只写引擎算好的值，并清掉 live 计时字段。
 * `durationMs` 缺省表示引擎也不知道（例如准入即失败 / 本地派发失败），保持「未知」，
 * 由 UI 展示「—」——宁可缺失，也不用时间线去凑一个假数字。
 */
export function finishMessageClock(message: ChatMessage, durationMs?: number): ChatMessage {
  const next: ChatMessage = { ...message, runStartedAt: undefined };
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    next.durationMs = Math.max(0, durationMs);
  }
  return next;
}

/**
 * 引擎完全没参与时（IPC 拒绝 / 派发失败）本地唯一可观测的墙钟。
 * 这是实测而非推断：只有气泡自己带着 runStartedAt 才可用。
 */
export function localElapsedMs(message: ChatMessage): number | undefined {
  if (message.runStartedAt == null) return undefined;
  return Math.max(0, Date.now() - message.runStartedAt);
}

/**
 * 从磁盘 hydrate 时收束「进程已死但仍 active」的时间线。
 * - cancelled / crashed：清掉 pending（Resume 看 runStatus + checkpoint），补软中断行
 * - 其它终态：一并清 pending，避免永远 Planning
 * - 耗时：只保留引擎已写下的值，缺失就保持未知（**不再从时间线推断**）
 */
export function settleLoadedMessages(
  messages: ChatMessage[],
  runStatus: string | undefined,
): ChatMessage[] {
  if (runStatus === "running" || runStatus === "queued") return messages;
  const resumable = runStatus === "cancelled" || runStatus === "crashed";
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    // 非运行中：丢掉 live 计时字段；耗时只认引擎写下的值，缺失就保持未知（UI 展示「—」）
    const base = m.runStartedAt != null ? { ...m, runStartedAt: undefined } : m;
    let timeline = freezeTimelineHistory(stripQueuedWait(base.timeline ?? []), base.durationMs);
    const hasSoft = timeline.some((s) => s.kind === "error" && isSoftStopCode(s.code));
    // 崩溃 / 取消恢复：补一条软中断，便于时间线展示「继续」。
    if (resumable && !hasSoft) {
      const softCode = runStatus === "crashed" ? "PROCESS_EXIT" : "CANCELLED";
      const softMsg = softCode === "PROCESS_EXIT" ? "Exited unexpectedly." : "Stopped.";
      timeline = appendError(timeline, softMsg, softCode);
    }
    return {
      ...base,
      pending: false,
      timeline,
    };
  });
}
