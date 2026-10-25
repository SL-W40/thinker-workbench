/**
 * 计划草稿：writer 子代理产出的待确认计划在时间线上的呈现。
 */
import { type AgentEvent, type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { dropTrailingEphemeralThoughts } from "./planning";
import { deactivateStatuses } from "./status";

/**
 * create_plan 参数流式（`plan` 事件的 drafting 阶段）：
 * 先把工具卡片挂到时间线，让计划随生成逐步成形；
 * 后续真正的 tool start / end 按 callId（或缺 id 时的同名兜底）复用这张卡。
 */
export function applyPlanDraftStep(
  steps: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "plan" }>,
): ChatTimelineStep[] {
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  const callId = event.callId?.trim();

  let idx = callId
    ? next.findIndex((s) => s.kind === "tool" && Boolean(s.callId) && s.callId === callId)
    : -1;
  // 尚未拿到 callId / 首包 id 迟到：复用末尾仍在跑的 create_plan 卡，避免开第二张
  if (idx < 0) {
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        s.name === "create_plan" &&
        s.phase === "start" &&
        s.active &&
        (!callId || !s.callId)
      ) {
        idx = i;
        break;
      }
    }
  }

  if (idx >= 0) {
    const prev = next[idx];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[idx] = {
      ...prev,
      callId: callId ?? prev.callId,
      phase: "start",
      active: true,
      startedAt: prev.startedAt ?? Date.now(),
    };
    return copy;
  }

  return [
    ...next,
    {
      id: createId("tl"),
      kind: "tool",
      name: "create_plan",
      ...(callId ? { callId } : {}),
      phase: "start",
      active: true,
      startedAt: Date.now(),
    },
  ];
}
