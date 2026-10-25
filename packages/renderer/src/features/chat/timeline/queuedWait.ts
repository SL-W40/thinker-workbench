/**
 * 排队等待槽：新消息已发出但尚未落到会话时的占位 step，以及它升级为正式消息前的接驳逻辑。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { QUEUED_WAIT_STEP_ID } from "./constants";

/** 这些事件说明 run 已经开始产出，排队槽应切到 busy。 */
export const QUEUE_PROMOTE_EVENTS = new Set([
  "token",
  "status",
  "tool",
  "hitl",
  "subagent",
  "model_switch",
  "usage",
]);

/** 去掉排队等待文案。没有该步时返回原数组。 */
export function stripQueuedWait(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  if (!steps.some((step) => step.id === QUEUED_WAIT_STEP_ID)) return steps;
  return steps.filter((step) => step.id !== QUEUED_WAIT_STEP_ID);
}

/** 用最新名次覆盖排队等待文案。 */
export function withQueuedWait(steps: ChatTimelineStep[], text: string): ChatTimelineStep[] {
  return [...stripQueuedWait(steps), { id: QUEUED_WAIT_STEP_ID, kind: "text", text }];
}

/**
 * 后台槽上的排队过渡：终态去掉等待文案；模型开始输出时标成 busy。
 * 出队前保持不忙，避免侧栏外的会话提前变成「正在跑」。
 */
export function applyQueuedSlotEvent(
  slot: { busy: boolean; timeline: ChatTimelineStep[] },
  eventType: string,
): void {
  if (eventType === "done" || eventType === "error") {
    slot.timeline = stripQueuedWait(slot.timeline);
    return;
  }
  if (!QUEUE_PROMOTE_EVENTS.has(eventType) || slot.busy) return;
  slot.timeline = stripQueuedWait(slot.timeline);
  slot.busy = true;
}
