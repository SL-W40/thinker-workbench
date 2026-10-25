/**
 * 最终答复与时间线的对齐：消除同一段正文在时间线与消息体之间的互相回显。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";

/**
 * 流式 token 可能在句中停住，而 done 的正文更完整。
 * 仅当完整正文以时间线已有叙述为前缀时，把缺的尾巴补进最后一段 text。
 */
export function reconcileTimelineReply(
  steps: ChatTimelineStep[],
  fullText: string,
): ChatTimelineStep[] {
  const full = fullText.trim();
  if (!full) return steps;
  const indexes: number[] = [];
  const parts: string[] = [];
  steps.forEach((step, index) => {
    if (step.kind !== "text") return;
    indexes.push(index);
    parts.push(step.text);
  });
  if (indexes.length === 0) return steps;
  const streamed = parts.join("\n\n");
  if (!full.startsWith(streamed) || full.length === streamed.length) return steps;
  const last = indexes[indexes.length - 1];
  if (last === undefined) return steps;
  const prev = steps[last];
  if (prev?.kind !== "text") return steps;
  const copy = [...steps];
  copy[last] = { ...prev, text: prev.text + full.slice(streamed.length) };
  return copy;
}

/** 截断到 max 字符，末尾加省略号。 */
export function truncatePhrase(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * 正文与时间线去重：时间线（text / transition 步）已逐字呈现过的段落，
 * 不再在正文重复渲染。
 *
 * 场景：模型在过程叙述句没按约定带 `[NEXT]` 标记时，这些句子会以小结 /
 * 叙述步出现在时间线，而 done 的完整正文又原样包含它们 —— 底部正文就会
 * 把同样的两句话再印一遍。段落级去重（含时间线步骤被截断时的前缀匹配）
 * 只删「时间线已经展示过」的内容，最终答复的独有段落不受影响。
 */
export function stripTimelineEcho(text: string, steps: ChatTimelineStep[]): string {
  if (!text?.trim()) return text;
  const shown: string[] = [];
  for (const s of steps) {
    if (s.kind === "text" || s.kind === "transition") {
      const t = s.text.trim();
      if (t) shown.push(t);
    }
  }
  if (shown.length === 0) return text;
  const parts = text.split(/\n{2,}/);
  const kept = parts.filter((part) => {
    const t = part.trim();
    if (!t) return false;
    return !shown.some((s) => t === s || t.startsWith(s) || s.startsWith(t));
  });
  return kept.join("\n\n");
}
