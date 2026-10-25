/**
 * `todo` 工具的时间线提示（纯函数）：把入参压成结构化提示，供时间线卡片区分读 / 写。
 *
 * 只在 start 事件里带上（入参即事实），end 沿用 start 的那份 —— 见 graph/nodes/tools/runner。
 */
import { type ChatTimelineTodoHint, isTodoAction } from "@thinker-workbench/shared";
import type { ToolArgs } from "../types";

/** 卡片最多展示的条目文案条数（超出的按 count 折算成 +N）。 */
export const TODO_HINT_LABEL_LIMIT = 3;

/** 单条文案的展示上限。 */
const LABEL_MAX = 40;

/** 从入参里取出条目文案（label 优先，其次 id）。 */
function itemLabel(row: Record<string, unknown>): string {
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (label) return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  return id;
}

/**
 * 生成 `todo` 工具的结构化提示；动作非法或读不出时返回 undefined（交给通用工具行渲染）。
 */
export function todoUiHint(args: ToolArgs): ChatTimelineTodoHint | undefined {
  const action = typeof args.action === "string" ? args.action.trim() : "";
  if (!isTodoAction(action)) return undefined;

  // 只读动作没有受影响条目，只标注动作即可
  if (action === "list") return { action };

  const items = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) return { action };

  const labels: string[] = [];
  for (const row of items) {
    const text =
      row && typeof row === "object" ? itemLabel(row) : typeof row === "string" ? row : "";
    if (text) labels.push(text);
  }
  return {
    action,
    count: labels.length,
    labels: labels.slice(0, TODO_HINT_LABEL_LIMIT),
  };
}
