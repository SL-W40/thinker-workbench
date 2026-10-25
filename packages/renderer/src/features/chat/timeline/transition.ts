/**
 * 承上启下小结行的识别与剥离：流式输出里的过渡标记不属于正文。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import {
  TRANSITION_LINE_RE,
  TRANSITION_MARKER,
  TRANSITION_MARKER_MAX,
  TRANSITION_TEXT_MAX,
} from "./constants";
import { truncatePhrase } from "./reconcile";

/**
 * 判断 text 步是否为「承上启下」小结行：
 * 单行短句（≤60 字、无换行），且其后仍有工具 / 思考步骤（过程叙述而非答复收尾）。
 * 提示词已约束模型仅在关键结论 / 思维转变 / 用户须知时输出这样一行——
 * 命中才以小结样式独立呈现，未命中（长叙述 / 最终答复）维持普通正文。
 */
export function isTransitionTextStep(steps: ChatTimelineStep[], stepId: string): boolean {
  const idx = steps.findIndex((s) => s.kind === "text" && s.id === stepId);
  if (idx < 0) return false;
  const step = steps[idx];
  if (step?.kind !== "text") return false;
  const text = step.text.trim();
  if (!text || text.includes("\n") || text.length > TRANSITION_TEXT_MAX) return false;
  return steps
    .slice(idx + 1)
    .some((s) => s.kind === "tool" || (s.kind === "status" && s.status === "thinking"));
}

/**
 * 从一段回复文本里剥离 `[NEXT]` 标记行。
 * 流式累积时标记可能被 token 切开：不完整的行不匹配、原样保留，
 * 待下一片补全后自然被剥离（对同一文本重复调用是安全的）。
 */
export function stripTransitionLines(text: string): string {
  if (!text.includes(TRANSITION_MARKER)) return text;
  return text
    .replace(TRANSITION_LINE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

/**
 * 剥离标记行并取首个小结内容（≤50 字）。
 */
export function extractTransitionLine(text: string): { cleaned: string; transition?: string } {
  let transition: string | undefined;
  const cleaned = text.replace(TRANSITION_LINE_RE, (_match, body: string) => {
    const trimmed = (body ?? "").trim();
    if (trimmed && !transition) transition = truncatePhrase(trimmed, TRANSITION_MARKER_MAX);
    return "";
  });
  return { cleaned, transition };
}
