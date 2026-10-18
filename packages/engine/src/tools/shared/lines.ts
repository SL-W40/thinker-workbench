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
 * 工具参数解析出的行区间。
 * `end === null` 表示到文件末尾（在 resolve 时填入总行数）。
 */
export type ParsedLineRange = { start: number; end: number | null };

/**
 * 从工具参数解析行区间。
 * - 都未提供 → null（整文件）
 * - 只给 start_line → 从该行到文件末尾
 * - 只给 end_line → 从第 1 行到该行
 * - 都给且 start > end → 抛错
 */
export function parseLineRange(args: {
  start_line?: unknown;
  end_line?: unknown;
}): ParsedLineRange | null {
  const hasStart =
    args.start_line !== undefined && args.start_line !== null && args.start_line !== "";
  const hasEnd = args.end_line !== undefined && args.end_line !== null && args.end_line !== "";
  if (!hasStart && !hasEnd) return null;

  const start = hasStart ? parseLineNumber(args.start_line) : 1;
  const end = hasEnd ? parseLineNumber(args.end_line) : null;
  if (start == null) {
    throw new Error("start_line must be an integer >= 1.");
  }
  if (hasEnd && end == null) {
    throw new Error("end_line must be an integer >= 1.");
  }
  if (end != null && start > end) {
    throw new Error(`Invalid line range: start_line (${start}) > end_line (${end}).`);
  }
  return { start, end };
}

/**
 * 把解析区间落到具体文件：缺省 end→末尾；end 超出则夹到末尾。
 * start 超过总行数仍报错（整段都在文件外）。
 */
export function resolveRangeInFile(
  range: ParsedLineRange,
  totalLines: number,
  pathLabel: string,
): LineRange {
  if (totalLines === 0) {
    throw new Error(`Cannot use line range on empty file: ${pathLabel}`);
  }
  if (range.start > totalLines) {
    throw new Error(
      `Line range start_line (${range.start}) out of bounds for ${pathLabel} (${totalLines} lines).`,
    );
  }
  const end = range.end == null ? totalLines : Math.min(range.end, totalLines);
  return { start: range.start, end };
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
    contents.length === 0 ? [] : contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return [...lines.slice(0, range.start - 1), ...replacement, ...lines.slice(range.end)];
}

/**
 * 展示层截断超长行：超出 maxChars 的部分折叠为 `…[+N chars]`。
 * 只截内容不截指针——调用方保留 路径:行号，全文可用 read_file 精确读回。
 */
export function clipLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  return `${line.slice(0, maxChars)}…[+${line.length - maxChars} chars]`;
}
