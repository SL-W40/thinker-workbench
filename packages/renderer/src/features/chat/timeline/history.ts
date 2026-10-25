/**
 * 历史时间线的取舍与冻结：多份时间线合并时挑信息量更全的一份，切换会话前冻结现场。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { dropTrailingEphemeralThoughts } from "./planning";
import { deactivateAll } from "./status";

/**
 * 比较两条时间线，保留工具行与 diff 更完整的一侧。
 * 本地与 DB 择优、事件流合并 timeline 时共用；平分取本地（左侧）。
 */
export function pickRicherTimeline(
  a: ChatTimelineStep[],
  b: ChatTimelineStep[] | undefined,
): ChatTimelineStep[] {
  const score = (steps: ChatTimelineStep[]) => {
    let n = steps.length;
    for (const s of steps) {
      if (s.kind === "tool") {
        n += 10;
        if (s.diff) n += 100;
        if (s.phase === "end") n += 5;
      }
      if (s.kind === "status" && s.text) n += 3;
      if (s.kind === "text" && s.text) n += 2;
      if (s.kind === "error") n += 20;
    }
    return n;
  };
  const left = a ?? [];
  const right = b ?? [];
  return deactivateAll(score(left) >= score(right) ? left : right);
}

/**
 * 读盘 / hydrate：冻结时间线耗时，禁止用墙钟重算。
 * - 已有 durationMs：保留并去掉 startedAt
 * - 无 durationMs：去掉 startedAt（勿 Date.now()-startedAt），可选用 messageDurationMs 回填
 */
export function freezeTimelineHistory(
  steps: ChatTimelineStep[],
  messageDurationMs?: number,
): ChatTimelineStep[] {
  const fallback =
    messageDurationMs != null && messageDurationMs > 0 ? messageDurationMs : undefined;
  let usedFallback = false;
  const next = steps.map((s) => {
    if (s.kind === "tool" && s.active) return { ...s, active: false };
    if (s.kind !== "status" || s.status !== "thinking") return s;
    if (s.durationMs != null) {
      return { ...s, active: false, startedAt: undefined };
    }
    if (fallback != null && !usedFallback) {
      usedFallback = true;
      return {
        ...s,
        active: false,
        durationMs: fallback,
        startedAt: undefined,
      };
    }
    return { ...s, active: false, startedAt: undefined };
  });
  return dropTrailingEphemeralThoughts(next);
}
