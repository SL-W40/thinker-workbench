/**
 * `@` 文件/目录提及：路径拆分与模糊排序（文件名优先、最近加权）。
 */

export type MentionPathEntry = {
  path: string;
  isDir: boolean;
};

export type RankedFileHit = {
  path: string;
  /** 展示主行：文件名或目录名 */
  name: string;
  /** 展示副行：父目录；根下为空 */
  dir: string;
  score: number;
  recent: boolean;
  isDir: boolean;
};

/** 拆成末段名 + 父目录。 */
export function splitFilePath(path: string): { name: string; dir: string } {
  const norm = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const i = norm.lastIndexOf("/");
  if (i < 0) return { name: norm, dir: "" };
  return { name: norm.slice(i + 1) || norm, dir: norm.slice(0, i) };
}

/** 目录过长时从左侧省略。 */
export function truncateDirLeft(dir: string, max = 44): string {
  if (!dir || dir.length <= max) return dir;
  return `…${dir.slice(-(max - 1))}`;
}

/**
 * 简易模糊分：越高越靠前。
 */
export function scoreFilePath(
  path: string,
  query: string,
  recent: boolean,
  isDir = false,
): number {
  const q = query.trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
  const norm = path.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const { name, dir } = splitFilePath(norm);
  if (!q) return recent ? 1_000 : 0;

  let score = 0;
  if (name === q) score += 12_000;
  else if (name.startsWith(q)) score += 8_000;
  else if (name.includes(q)) score += 5_000;
  else if (norm.endsWith(`/${q}`) || norm.includes(`/${q}.`)) score += 4_500;
  else if (norm.includes(q)) score += 2_500;
  else if (subsequenceMatch(name, q)) score += 1_400;
  else if (subsequenceMatch(norm, q)) score += 700;
  else return -1;

  // 末段越短、越靠前越好
  score += Math.max(0, 240 - name.length);
  // 多段路径 query：src/chat
  if (q.includes("/") && norm.includes(q)) score += 1_200;
  const segs = dir.split("/").filter(Boolean);
  if (segs.some((seg) => seg === q)) score += 900;
  else if (segs.some((seg) => seg.startsWith(q))) score += 400;
  // 目录名命中时略加权，便于按文件夹检索
  if (isDir && (name === q || name.startsWith(q))) score += 350;
  if (recent) score += 550;
  return score;
}

function subsequenceMatch(hay: string, needle: string): boolean {
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) {
    if (hay[i] === needle[j]) j += 1;
  }
  return j === needle.length;
}

/** 对候选路径打分排序（含目录）。 */
export function rankFileMentions(
  entries: MentionPathEntry[],
  recentPaths: string[],
  query: string,
  limit: number,
): RankedFileHit[] {
  const recentSet = new Set(recentPaths);
  const q = query.trim().toLowerCase();
  const byPath = new Map<string, MentionPathEntry>();
  for (const e of entries) byPath.set(e.path, e);
  for (const p of recentPaths) {
    if (!byPath.has(p)) byPath.set(p, { path: p, isDir: false });
  }

  const universe = q
    ? [...byPath.values()]
    : recentPaths.map((p) => byPath.get(p) ?? { path: p, isDir: false });

  const hits: RankedFileHit[] = [];
  for (const entry of universe) {
    const recent = recentSet.has(entry.path);
    const score = scoreFilePath(entry.path, q, recent, entry.isDir);
    if (score < 0) continue;
    const { name, dir } = splitFilePath(entry.path);
    hits.push({
      path: entry.path,
      name,
      dir,
      score,
      recent,
      isDir: entry.isDir,
    });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.recent !== b.recent) return a.recent ? -1 : 1;
    // 同分时目录略靠前，便于按文件夹定位
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return hits.slice(0, limit);
}
