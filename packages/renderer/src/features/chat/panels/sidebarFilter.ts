/**
 * 侧栏筛选（纯函数）：按工作空间名 / 会话标题做大小写无关过滤。
 *
 * 独立成模块是为了可测；UI 只消费结果，不在这里做 IPC。
 */
import type { ThreadMeta, WorkspaceRecord } from "@thinker-workbench/shared";

/** 侧栏分组（沿用 WorkspaceSidebar 的编排形状）。 */
export type SidebarGroup = {
  workspace: WorkspaceRecord;
  sessions: ThreadMeta[];
};

/** 归一化：忽略大小写与首尾空白。 */
function fold(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 按关键词过滤分组。
 * - 工作空间名命中：保留该组下的全部会话（便于整体上下文）
 * - 会话标题命中：只保留命中的会话
 * - 关键词为空：原样返回
 */
export function filterSidebarGroups(groups: SidebarGroup[], query: string): SidebarGroup[] {
  const needle = fold(query ?? "");
  if (!needle) return groups;
  const out: SidebarGroup[] = [];
  for (const group of groups) {
    const nameHit = fold(group.workspace.name).includes(needle);
    const sessions = nameHit
      ? group.sessions
      : group.sessions.filter((s) => fold(s.title).includes(needle));
    if (nameHit || sessions.length > 0) {
      out.push({ workspace: group.workspace, sessions });
    }
  }
  return out;
}

/** 过滤后剩余会话总数（空态文案与「无命中」判断用）。 */
export function countSessions(groups: SidebarGroup[]): number {
  return groups.reduce((sum, g) => sum + g.sessions.length, 0);
}

/**
 * 把片段按命中区间切成三段，供 React 渲染（避免在 DB / IPC 层拼 HTML）。
 * 下标非法时退化为整段纯文本。
 */
export function splitSnippetMatch(
  snippet: string,
  match: { from: number; to: number } | null,
): { before: string; hit: string; after: string } {
  const text = snippet ?? "";
  if (!match) return { before: text, hit: "", after: "" };
  const from = Math.max(0, Math.min(text.length, match.from));
  const to = Math.max(from, Math.min(text.length, match.to));
  return { before: text.slice(0, from), hit: text.slice(from, to), after: text.slice(to) };
}
