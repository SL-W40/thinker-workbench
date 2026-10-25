/**
 * 已完成回合的工作历史折叠：
 * 非进行中时把工具 / 思考 / 中间小结收进「Worked for …」，
 * 仅末尾正式答复与错误外露。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { formatDurationOrDash } from "../usage/usageStats";

/**
 * 末尾正式答复：时间线中最后一段连续 `text` 步的起始下标。
 * 无 text 时返回 -1。
 */
export function terminalReplyStartIndex(steps: ChatTimelineStep[]): number {
  let lastText = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.kind === "text") {
      lastText = i;
      break;
    }
  }
  if (lastText < 0) return -1;
  let start = lastText;
  while (start > 0 && steps[start - 1]?.kind === "text") start--;
  return start;
}

/** 折叠时是否外露该步（须结合整条时间线：仅末尾答复 + 错误）。 */
export function isWorkFoldExteriorStep(steps: ChatTimelineStep[], stepId: string): boolean {
  const replyStart = terminalReplyStartIndex(steps);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    if (s.id !== stepId) continue;
    if (s.kind === "error") return true;
    if (s.kind === "text" && replyStart >= 0 && i >= replyStart) return true;
    return false;
  }
  return false;
}

/** 是否存在可折叠内容（工具 / 思考 / 中间小结等）。 */
export function timelineHasFoldableWork(steps: ChatTimelineStep[]): boolean {
  const exterior = filterTimelineExterior(steps);
  const exteriorIds = new Set(exterior.map((s) => s.id));
  for (const s of steps) {
    if (s.kind === "status" && s.status === "planning") continue;
    if (!exteriorIds.has(s.id)) return true;
  }
  return false;
}

/** 折叠态只保留末尾正式答复与错误；中间小结一并收起。 */
export function filterTimelineExterior(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const replyStart = terminalReplyStartIndex(steps);
  return steps.filter((s, i) => {
    if (s.kind === "error") return true;
    if (s.kind === "text" && replyStart >= 0 && i >= replyStart) return true;
    return false;
  });
}

/**
 * 「Worked for 1m 50s」耗时片段；与 usage 底栏同一套 formatElapsed。
 * @returns 如 `1m 50s`；未知（引擎没给）时 `—`
 */
export function formatWorkedForElapsed(durationMs: number | undefined): string {
  return formatDurationOrDash(durationMs);
}

/**
 * 是否应折成 Worked for 行。
 * - 进行中：不折
 * - 本会话刚跑完且仍是末条：不折（等发出跟随后再折）
 * - 重开历史（本挂载从未 live）或已非末条：折
 */
export function shouldFoldWorkHistory(opts: {
  live: boolean;
  hasWork: boolean;
  livedInSession: boolean;
  trailing: boolean;
}): boolean {
  if (opts.live || !opts.hasWork) return false;
  if (opts.livedInSession && opts.trailing) return false;
  return true;
}
