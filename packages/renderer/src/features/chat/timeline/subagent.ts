/**
 * 子代理事件归并：把子代理的同构事件接到父 session 的时间线上，条目超出上限时做淘汰。
 */
import { type AgentEvent, type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { MAX_SUBAGENT_ENTRIES } from "./constants";
import { applyStatus, deactivateAll } from "./status";
import { appendReplyText, appendThinkingText } from "./text";
import { applyToolEvent } from "./tools";

/** 把子代理 childEvent 归并进其 childTimeline（与主会话同一套规则）。 */
export function applySubagentChildEvent(
  childTimeline: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "subagent" }>,
): ChatTimelineStep[] {
  const child = event.childEvent;
  if (!child) return childTimeline;
  const base = {
    threadId: event.threadId,
    runId: event.runId,
    ts: event.ts,
  };
  if (child.type === "status") {
    return applyStatus(childTimeline, child.status);
  }
  if (child.type === "token") {
    const channel = child.channel ?? "reply";
    if (channel === "thinking") {
      return appendThinkingText(childTimeline, child.text);
    }
    return appendReplyText(childTimeline, child.text);
  }
  if (child.type === "tool") {
    return applyToolEvent(childTimeline, { ...base, ...child });
  }
  return childTimeline;
}

/** 合并子代理 Task 生命周期到时间线。 */
export function applySubagentEvent(
  steps: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "subagent" }>,
): ChatTimelineStep[] {
  const next = [...steps];
  const idx = next.findIndex((s) => s.kind === "subagent" && s.taskId === event.taskId);
  const prev =
    idx >= 0 && next[idx]?.kind === "subagent"
      ? (next[idx] as Extract<ChatTimelineStep, { kind: "subagent" }>)
      : null;
  // 已收束（含会话停止）后忽略迟到的 progress
  if (
    prev &&
    (prev.phase === "finished" || prev.phase === "failed" || prev.phase === "cancelled") &&
    (event.phase === "started" || event.phase === "progress")
  ) {
    return steps;
  }
  const active = event.phase === "started" || event.phase === "progress";
  const liveLine =
    event.phase === "progress" || event.phase === "started"
      ? (event.liveLine ?? event.summary ?? prev?.liveLine)
      : event.phase === "cancelled"
        ? undefined
        : prev?.liveLine;
  let entries = prev?.entries ? [...prev.entries] : [];
  if (event.timelineEntry) {
    entries.push(event.timelineEntry);
    if (entries.length > MAX_SUBAGENT_ENTRIES) {
      entries = entries.slice(entries.length - MAX_SUBAGENT_ENTRIES);
    }
  }
  let childTimeline = prev?.childTimeline ? [...prev.childTimeline] : [];
  if (event.childEvent) {
    childTimeline = applySubagentChildEvent(childTimeline, event);
  }
  if (event.phase === "finished" || event.phase === "failed" || event.phase === "cancelled") {
    childTimeline = deactivateAll(childTimeline);
  }
  const patch: Extract<ChatTimelineStep, { kind: "subagent" }> = {
    id: prev?.id ?? createId("tl"),
    kind: "subagent",
    taskId: event.taskId,
    subagent: event.subagent,
    // 标题只增不减：避免后续 progress 冲掉已解析的 title
    title: event.title?.trim() || prev?.title,
    phase: event.phase,
    background: event.background ?? prev?.background,
    summary:
      event.phase === "finished" || event.phase === "failed" || event.phase === "cancelled"
        ? (event.summary ?? prev?.summary)
        : prev?.summary,
    liveLine,
    entries: entries.length ? entries : undefined,
    childTimeline: childTimeline.length ? childTimeline : undefined,
    error:
      event.error ??
      (event.phase === "failed" || event.phase === "cancelled" ? event.summary : undefined),
    active,
  };
  if (idx >= 0) next[idx] = patch;
  else next.push(patch);
  return next;
}
