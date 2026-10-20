/**
 * `@` 提及候选路径收集（纯函数）。
 */

/** Skills 弹窗每页条数。 */
export const SKILLS_PAGE = 8;

type TreeNodeLite = { path?: string; type?: string; children?: unknown[] };

/** 收集工作区文件与目录相对路径（供 `@` 检索；跳过以 `.` 开头的项）。*/
export function collectMentionPaths(node: TreeNodeLite | null): { path: string; isDir: boolean }[] {
  if (!node) return [];
  const out: { path: string; isDir: boolean }[] = [];
  const walk = (n: TreeNodeLite) => {
    const p = typeof n.path === "string" ? n.path.replace(/\\/g, "/") : "";
    if (p && p !== ".") {
      if (n.type === "file") out.push({ path: p, isDir: false });
      else if (n.type === "dir") out.push({ path: p, isDir: true });
    }
    for (const c of n.children ?? []) {
      walk(c as TreeNodeLite);
    }
  };
  walk(node);
  return out;
}
