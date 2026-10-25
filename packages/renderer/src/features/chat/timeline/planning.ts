/**
 * 空壳思考清理：只用于「思考中」状态的过渡帧，定稿后不再保留。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";

/**
 * 无正文的已结束思考可丢弃。
 * 常见于：status=thinking 后立刻调工具，模型未流出 reasoning token，
 * 却留下不可展开的「Thought 3.5s」空壳。
 */
export function isEphemeralThought(step: ChatTimelineStep): boolean {
  if (step.kind !== "status" || step.status !== "thinking") return false;
  if (step.active) return false;
  return !step.text?.trim();
}

/** planning 从不入库持久展示；一有实质内容就清掉。 */
export function dropPlanning(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const next = steps.filter((s) => !(s.kind === "status" && s.status === "planning"));
  return next.length === steps.length ? steps : next;
}

/** 去掉全部空壳思考，并清掉 planning（不限末尾，避免夹在工具之间）。 */
export function dropTrailingEphemeralThoughts(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const base = dropPlanning(steps);
  const next = base.filter((s) => !isEphemeralThought(s));
  return next.length === base.length ? base : next;
}
