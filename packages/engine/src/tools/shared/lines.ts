/**
 * 文本行号辅助：1-based inclusive 区间解析与替换。
 * 读写文件工具共用。
 */

/** 检测文件主要换行符。 */
export function detectEol(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** 按行拆分（去掉行尾 \\r），保留逻辑行内容。 */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  // 末尾换行会产生尾部空行，与常见编辑器「最后一行后还有 \\n」一致
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** 用指定 eol 拼回全文。 */
export function joinLines(lines: string[], eol: "\r\n" | "\n"): string {
  return lines.join(eol);
}

/** 解析可选正整数行号；非法时返回 null。 */
export function parseLineNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return null;
}

export type LineRange = { start: number; end: number };

/**
 * 从工具参数解析行区间。
 * - 都未提供 → null（整文件）
 * - 只提供其一 → 抛错
 * - start > end → 抛错
 */
export function parseLineRange(args: {
  start_line?: unknown;
  end_line?: unknown;
}): LineRange | null {
  const hasStart = args.start_line !== undefined && args.start_line !== null && args.start_line !== "";
  const hasEnd = args.end_line !== undefined && args.end_line !== null && args.end_line !== "";
  if (!hasStart && !hasEnd) return null;
  if (!hasStart || !hasEnd) {
    throw new Error("start_line and end_line must be provided together (1-based inclusive).");
  }
  const start = parseLineNumber(args.start_line);
  const end = parseLineNumber(args.end_line);
  if (start == null || end == null) {
    throw new Error("start_line and end_line must be integers >= 1.");
  }
  if (start > end) {
    throw new Error(`Invalid line range: start_line (${start}) > end_line (${end}).`);
  }
  return { start, end };
}

/** 校验区间落在 [1, totalLines]（允许空文件 total=0 时仅整文件模式）。 */
export function assertRangeInFile(range: LineRange, totalLines: number, pathLabel: string): void {
  if (totalLines === 0) {
    throw new Error(`Cannot use line range on empty file: ${pathLabel}`);
  }
  if (range.start > totalLines || range.end > totalLines) {
    throw new Error(
      `Line range ${range.start}-${range.end} out of bounds for ${pathLabel} (${totalLines} lines).`,
    );
  }
}

/**
 * 抽取 inclusive 行区间，并生成带行号前缀的正文。
 * 行号宽度按 end 对齐。
 */
export function formatNumberedSlice(lines: string[], range: LineRange): string {
  const width = String(range.end).length;
  const out: string[] = [];
  for (let i = range.start; i <= range.end; i++) {
    const body = lines[i - 1] ?? "";
    out.push(`${String(i).padStart(width, " ")}|${body}`);
  }
  return out.join("\n");
}

/**
 * 用 contents 替换 lines 的 [start, end] inclusive。
 * contents 按 \\n 拆成替换行（允许空字符串 → 删除区间）。
 */
export function replaceLineRange(lines: string[], range: LineRange, contents: string): string[] {
  const replacement =
    contents.length === 0
      ? []
      : contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return [...lines.slice(0, range.start - 1), ...replacement, ...lines.slice(range.end)];
}
