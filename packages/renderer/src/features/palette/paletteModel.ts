/**
 * 命令面板的数据层（纯函数）：候选构造、模糊匹配与排序、分组。
 *
 * 独立成模块是为了可测；组件只负责键盘交互与渲染。
 */

/** 候选类别（UI 分组图标与排序权重）。 */
export type PaletteGroup = "command" | "session" | "file" | "setting";

/** 面板里的一个候选。 */
export type PaletteItem = {
  /** 稳定 id（同一来源不重复）。 */
  id: string;
  group: PaletteGroup;
  title: string;
  /** 副标题（路径 / 描述）；可省略。 */
  subtitle?: string;
  /** 快捷键标签；可省略。 */
  shortcut?: string;
};

/** 类别权重：命令在最前，便于纯键盘操作。 */
const GROUP_WEIGHT: Record<PaletteGroup, number> = {
  command: 0,
  session: 1,
  file: 2,
  setting: 3,
};

/**
 * 子串模糊匹配得分：越小越靠前。
 * - 完全相等：0
 * - 前缀命中：10 - 长度差
 * - 子串命中：100 - 命中位置
 * - 顺序字符（ subsequence）命中：1000 + 间距
 * - 未命中：null
 */
export function fuzzyScore(title: string, query: string): number | null {
  const hay = title.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return -1;
  if (hay === needle) return 0;
  if (hay.startsWith(needle)) return 10 - (hay.length - needle.length) / 100;
  const index = hay.indexOf(needle);
  if (index >= 0) return 100 - index / 10;
  // 退化为顺序字符匹配（"ott" 命中 "outline.ts"）
  let needleIndex = 0;
  let gap = 0;
  let lastHit = -1;
  for (let i = 0; i < hay.length && needleIndex < needle.length; i += 1) {
    if (hay[i] === needle[needleIndex]) {
      if (lastHit >= 0) gap += i - lastHit - 1;
      lastHit = i;
      needleIndex += 1;
    }
  }
  return needleIndex === needle.length ? 1000 + gap : null;
}

/**
 * 按查询过滤并排序候选。
 * 空查询时只按类别顺序返回前若干条（避免面板一打开就是长列表）。
 */
export function rankPaletteItems(items: PaletteItem[], query: string, limit = 30): PaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...items].sort((a, b) => GROUP_WEIGHT[a.group] - GROUP_WEIGHT[b.group]).slice(0, limit);
  }
  const scored: Array<{ item: PaletteItem; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(item.title, trimmed) ?? fuzzyScore(item.subtitle ?? "", trimmed);
    if (score === null) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const groupDiff = GROUP_WEIGHT[a.item.group] - GROUP_WEIGHT[b.item.group];
    return groupDiff !== 0 ? groupDiff : a.item.title.localeCompare(b.item.title);
  });
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** 按 id 去重（同名文件可能来自多个 provider）。 */
export function dedupePaletteItems(items: PaletteItem[]): PaletteItem[] {
  const seen = new Set<string>();
  const out: PaletteItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** 默认排除的目录前缀（大且无意义的目录不进文件候选）。 */
const EXCLUDED_PREFIXES = [".git/", "node_modules/", "dist/", "build/", "out/", ".next/"];

/** 是否应排除该文件（大仓库下拉全量会卡，这里先做廉价过滤）。 */
export function isIgnoredFilePath(path: string): boolean {
  const value = path.replace(/\\/g, "/");
  return EXCLUDED_PREFIXES.some(
    (prefix) => value.startsWith(prefix) || value.includes(`/${prefix}`),
  );
}

/**
 * 把文件树节点压平成候选（带目录上限，避免一次性铺满）。
 * 调用方负责提供「已解析到ndepth」的节点列表。
 */
export function fileItems(paths: string[], workspaceName: string, limit = 200): PaletteItem[] {
  const out: PaletteItem[] = [];
  for (const path of paths) {
    if (isIgnoredFilePath(path)) continue;
    if (out.length >= limit) break;
    out.push({
      id: `file:${workspaceName}:${path}`,
      group: "file",
      title: path.split("/").pop() ?? path,
      subtitle: `${workspaceName} · ${path}`,
    });
  }
  return out;
}

/** 会话候选（副标题用工作区名与更新时间）。 */
export function sessionItems(
  sessions: Array<{ id: string; threadId: string; title: string; workspaceName: string }>,
): PaletteItem[] {
  return sessions.map((session) => ({
    id: `session:${session.id}`,
    group: "session",
    title: session.title || "未命名会话",
    subtitle: session.workspaceName,
  }));
}
