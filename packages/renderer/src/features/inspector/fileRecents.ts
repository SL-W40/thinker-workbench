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

/** 规范化路径用于比较：Windows 分隔符与首斜杠都不影响同一文件的判定。 */
function relKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\//, "");
}

/**
 * 用当前文件树的候选集清洗最近文件列表：不在候选集里的路径直接丢掉并写回；
 * 没有变化时返回原数组本身且不写盘，避免每次树刷新都产生一次存储写入。
 */
export function pruneFileRecents(
  workspaceId: string | null,
  recents: string[],
  candidates: readonly string[],
): string[] {
  const alive = new Set(candidates.map(relKey));
  const kept = recents.filter((path) => alive.has(relKey(path)));
  if (kept.length === recents.length) return recents;
  if (workspaceId) {
    try {
      localStorage.setItem(`${FILE_KEY}.${workspaceId}`, JSON.stringify(kept));
    } catch {
      /* ignore quota */
    }
  }
  return kept;
}

/** 将路径推到最近列表头部并写回。 */
export function pushFileRecent(workspaceId: string | null, path: string): string[] {
  if (!workspaceId || !path.trim()) return loadFileRecents(workspaceId);
  const next = [path, ...loadFileRecents(workspaceId).filter((p) => p !== path)].slice(0, FILE_MAX);
  try {
    localStorage.setItem(`${FILE_KEY}.${workspaceId}`, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
