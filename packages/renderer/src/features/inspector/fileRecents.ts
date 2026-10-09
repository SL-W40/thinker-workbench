/**
 * 按工作空间持久化最近打开的文件（localStorage，最多 7 条）。
 */

const FILE_KEY = "thinker.file.recents.v1";
const FILE_MAX = 7;

/** 读取某工作空间的最近文件列表。 */
export function loadFileRecents(workspaceId: string | null): string[] {
  if (!workspaceId) return [];
  try {
    const raw = localStorage.getItem(`${FILE_KEY}.${workspaceId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, FILE_MAX);
  } catch {
    return [];
  }
}

/** 将路径推到最近列表头部并写回。 */
export function pushFileRecent(workspaceId: string | null, path: string): string[] {
  if (!workspaceId || !path.trim()) return loadFileRecents(workspaceId);
  const next = [path, ...loadFileRecents(workspaceId).filter((p) => p !== path)].slice(
    0,
    FILE_MAX,
  );
  try {
    localStorage.setItem(`${FILE_KEY}.${workspaceId}`, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
