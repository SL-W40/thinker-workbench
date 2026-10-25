/**
 * GFM 管道表格：分隔行判定、单元格切分、对齐解析、流式未闭合判定。
 */
import type { BlockNode, InlineNode } from "../../types";
import { parseInline } from "../inline";
import type { ParseOptions } from "../options";

export function isTableSep(line: string): boolean {
  const t = line.trim();
  // 必须含管道，避免把 Setext 下划线 `---` 当成单列表格分隔行
  if (!t.includes("|")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(t);
}

/** 行是否以未转义的 `|` 结尾。 */
export function endsWithUnescapedPipe(str: string): boolean {
  if (!str.endsWith("|")) return false;
  let bs = 0;
  for (let k = str.length - 2; k >= 0 && str[k] === "\\"; k -= 1) bs += 1;
  return bs % 2 === 0;
}

/**
 * 按未转义 `|` 切分表格行；支持 `\|`。
 * 允许无前置/后置管道的 GFM 行（如 `a | b`）。
 */
export function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let cur = "";
  let i = s.startsWith("|") ? 1 : 0;
  while (i < s.length) {
    const c = s[i];
    if (c === undefined) break;
    if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (c === "|") {
      cells.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (!endsWithUnescapedPipe(s)) {
    cells.push(cur.trim());
  }
  return cells;
}

/** 是否像管道表数据行（含前置 `|` 或 `cell | cell`）。 */
export function isPipeTableLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|") || isTableSep(t)) return false;
  if (t.startsWith("|")) return true;
  return /[^|]+\|[^|]+/.test(t);
}

/** 当前行 + 下一行是否构成表头。 */
export function isTableHeaderAt(lines: string[], i: number): boolean {
  const next = lines[i + 1];
  return Boolean(next && lines[i]?.includes("|") && isTableSep(next));
}

export function parseAligns(sep: string): Array<"left" | "center" | "right" | null> {
  return splitRow(sep).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

export function parseTable(
  lines: string[],
  start: number,
  options: ParseOptions,
): { node: BlockNode; next: number } | null {
  if (!lines[start + 1] || !isTableSep(lines[start + 1])) return null;
  const headers = splitRow(lines[start]).map((c) => parseInline(c, options));
  const aligns = parseAligns(lines[start + 1]);
  let i = start + 2;
  const rows: InlineNode[][][] = [];
  while (i < lines.length && lines[i].includes("|") && !isTableSep(lines[i])) {
    rows.push(splitRow(lines[i]).map((c) => parseInline(c, options)));
    i += 1;
  }
  return { node: { type: "table", headers, aligns, rows }, next: i };
}

export function isStreamingTableIncomplete(
  rawMd: string,
  tableNext: number,
  lines: string[],
): boolean {
  const restBlank = lines.slice(tableNext).every((l) => !l.trim());
  if (!restBlank) return false;
  const normalized = rawMd.replace(/\r\n/g, "\n");
  return !normalized.endsWith("\n");
}
