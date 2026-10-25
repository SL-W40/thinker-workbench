/**
 * 时间线流式展示判定（无 React 依赖，便于单测）。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";

/**
 * 仅「当前列表末尾仍在增长」的正文步挂流式 caret。
 * run 仍 live 时若把 live 传给每一段叙述，历史段落会残留光标。
 */
export function isLiveStreamingTextStep(
  steps: ChatTimelineStep[],
  stepId: string,
  live: boolean,
): boolean {
  if (!live) return false;
  const last = steps[steps.length - 1];
  return last?.kind === "text" && last.id === stepId;
}
