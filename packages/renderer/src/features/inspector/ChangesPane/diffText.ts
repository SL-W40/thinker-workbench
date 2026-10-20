/**
 * unified diff 解析与语言推断（纯函数）。
 */
import type { GitChangedFile } from "@thinker-workbench/shared";

export type DiffRow =
  | { kind: "meta"; text: string }
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; text: string; oldNo: number | null; newNo: number | null }
  | { kind: "gap"; id: string; count: number };

/** diff 代码行 key：行序固定不重排，用序号保证唯一。 */
export function diffLineKey(index: number): string {
  return `l-${index}`;
}

export function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let prevNewEnd = 0;
  let gapIndex = 0;

  for (const raw of patch.split(/\r?\n/)) {
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("new file") ||
      raw.startsWith("deleted file") ||
      raw.startsWith("old mode") ||
      raw.startsWith("new mode") ||
      raw.startsWith("similarity index") ||
      raw.startsWith("rename from") ||
      raw.startsWith("rename to")
    ) {
      continue;
    }

    const hunk = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(raw);
    if (hunk) {
      const nextOld = Number.parseInt(hunk[1], 10) || 0;
      const nextNew = Number.parseInt(hunk[3], 10) || 0;
      if (prevNewEnd > 0 && nextNew > prevNewEnd + 1) {
        const count = nextNew - prevNewEnd - 1;
        if (count > 0) {
          rows.push({ kind: "gap", id: `gap-${gapIndex++}`, count });
        }
      }
      oldNo = nextOld;
      newNo = nextNew;
      rows.push({ kind: "hunk", text: raw });
      continue;
    }

    if (raw.startsWith("+")) {
      rows.push({ kind: "add", text: raw.slice(1), oldNo: null, newNo });
      newNo += 1;
      prevNewEnd = newNo - 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "del", text: raw.slice(1), oldNo, newNo: null });
      oldNo += 1;
      continue;
    }
    if (raw.startsWith(" ") || raw === "") {
      const text = raw.startsWith(" ") ? raw.slice(1) : "";
      rows.push({ kind: "ctx", text, oldNo, newNo });
      oldNo += 1;
      newNo += 1;
      prevNewEnd = newNo - 1;
      continue;
    }
    if (raw.startsWith("\\")) {
      rows.push({ kind: "meta", text: raw });
    }
  }
  return rows;
}

/** 扩展名 → highlight.js 语言 id（与聊天 FileDiffView 对齐）。*/
export function langFromPath(path: string): string | undefined {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    css: "css",
    less: "css",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  // 未登记语言不返回扩展名，避免无意义的逐行「高亮」排
  return map[ext];
}

/** 冲突优先，其次按改动量（+/-）降序，再按路径。*/
export function sortChangedFiles(list: GitChangedFile[]): GitChangedFile[] {
  return [...list].sort((a, b) => {
    const rank = (s: string) => (s === "conflict" ? 0 : 1);
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    const churn = (f: GitChangedFile) => f.added + f.removed;
    const byChurn = churn(b) - churn(a);
    if (byChurn !== 0) return byChurn;
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
  });
}
