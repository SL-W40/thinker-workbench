/**
 * 块级 Markdown 解析：标题、列表、表格、围栏、定义列表、脚注、数学块等。
 */
import { parseFrontmatter } from "../frontmatter";
import type {
  BlockNode,
  DefinitionItem,
  FootnoteDef,
  InlineNode,
  LinkDef,
  ListItem,
  MarkdownDocument,
} from "../types";
import { parseInline } from "./inline";
import type { ParseOptions } from "./options";

/** ATX 标题：`#` + 空白 + 非空内容（与解析分支一致，避免 ##foo 死循环）。 */
const ATX_HEADING_RE = /^(#{1,6})\s+(.+)$/;

function isAtxHeading(line: string): boolean {
  return ATX_HEADING_RE.test(line);
}

function isTableSep(line: string): boolean {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
}

/** 行是否以未转义的 `|` 结尾。 */
function endsWithUnescapedPipe(str: string): boolean {
  if (!str.endsWith("|")) return false;
  let bs = 0;
  for (let k = str.length - 2; k >= 0 && str[k] === "\\"; k -= 1) bs += 1;
  return bs % 2 === 0;
}

/**
 * 按未转义 `|` 切分表格行；支持 `\|`。
 * 允许无前置/后置管道的 GFM 行（如 `a | b`）。
 */
function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let cur = "";
  let i = s.startsWith("|") ? 1 : 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      cur += s[i + 1]!;
      i += 2;
      continue;
    }
    if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    cur += s[i]!;
    i += 1;
  }
  if (!endsWithUnescapedPipe(s)) {
    cells.push(cur.trim());
  }
  return cells;
}

/** 是否像管道表数据行（含前置 `|` 或 `cell | cell`）。 */
function isPipeTableLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|") || isTableSep(t)) return false;
  if (t.startsWith("|")) return true;
  return /[^|]+\|[^|]+/.test(t);
}

/** 当前行 + 下一行是否构成表头。 */
function isTableHeaderAt(lines: string[], i: number): boolean {
  return i + 1 < lines.length && lines[i]!.includes("|") && isTableSep(lines[i + 1]!);
}

function parseAligns(sep: string): Array<"left" | "center" | "right" | null> {
  return splitRow(sep).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

/** 由标题文本生成锚点 id（支持中文）。 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
}

function indentOf(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].replace(/\t/g, "    ").length : 0;
}

/** 匹配围栏开行：返回 fence 字符、数量、meta。 */
function matchFenceOpen(line: string): { ch: "`" | "~"; count: number; meta: string } | null {
  const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  const fence = m[1];
  return {
    ch: fence[0] as "`" | "~",
    count: fence.length,
    meta: m[2].trim(),
  };
}

function isFenceClose(line: string, ch: "`" | "~", count: number): boolean {
  const m = new RegExp(`^${ch === "`" ? "`" : "~"}{${count},}\\s*$`).exec(line);
  return Boolean(m);
}

function parseTable(
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

/** 去掉行首等价于 `cols` 列宽的空白（tab=4）。 */
function sliceContentColumn(line: string, cols: number): string {
  let removed = 0;
  let j = 0;
  while (j < line.length && removed < cols) {
    if (line[j] === "\t") {
      removed += 4;
      j += 1;
    } else if (line[j] === " ") {
      removed += 1;
      j += 1;
    } else {
      break;
    }
  }
  return line.slice(j);
}

function parseList(
  lines: string[],
  start: number,
  options: ParseOptions,
): { node: BlockNode; next: number } | null {
  const first = lines[start];
  const ul = /^(\s*)([-*+])(\s+)(.*)$/.exec(first);
  const ol = /^(\s*)(\d+)(\.)(\s+)(.*)$/.exec(first);
  if (!ul && !ol) return null;

  const ordered = Boolean(ol);
  const baseIndent = indentOf(first);
  const startNum = ol ? Number(ol[2]) : undefined;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const ind = indentOf(line);
    if (ind < baseIndent) break;

    const itemUl = /^(\s*)([-*+])(\s+)(.*)$/.exec(line);
    const itemOl = /^(\s*)(\d+)(\.)(\s+)(.*)$/.exec(line);
    const itemMatch = ordered ? itemOl : itemUl;
    if (!itemMatch || indentOf(line) !== baseIndent) break;

    // 内容列 = 缩进 + marker（含有序的 `.`）+ 随后空白
    const indentWidth = itemMatch[1]!.replace(/\t/g, "    ").length;
    const contentCol = ordered
      ? indentWidth + itemOl![2]!.length + 1 + itemOl![4]!.length
      : indentWidth + 1 + itemUl![3]!.length;

    let body = ordered ? itemOl![5]! : itemUl![4]!;
    let task = false;
    let checked = false;
    const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(body);
    if (taskMatch) {
      task = true;
      checked = taskMatch[1].toLowerCase() === "x";
      body = taskMatch[2];
    }

    i += 1;
    const chunk: string[] = [body];
    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) {
        chunk.push("");
        i += 1;
        continue;
      }
      const nextInd = indentOf(next);
      if (nextInd <= baseIndent) break;
      const nestedUl = /^(\s*)([-*+])\s+/.test(next);
      const nestedOl = /^(\s*)(\d+)\.\s+/.test(next);
      if ((nestedUl || nestedOl) && nextInd === baseIndent) break;
      chunk.push(sliceContentColumn(next, contentCol));
      i += 1;
    }

    const children = parseMarkdown(chunk.join("\n").replace(/\n+$/, ""), options);
    items.push({
      task,
      checked,
      children: children.length
        ? children
        : [{ type: "paragraph", children: parseInline(body, options) }],
    });
  }

  if (!items.length) return null;
  return {
    node: { type: "list", ordered, start: startNum, items },
    next: i,
  };
}

function parseBlockquote(
  lines: string[],
  start: number,
  options: ParseOptions,
): { node: BlockNode; next: number } {
  const chunk: string[] = [];
  let i = start;
  while (i < lines.length && /^>\s?/.test(lines[i])) {
    chunk.push(lines[i].replace(/^>\s?/, ""));
    i += 1;
  }
  return {
    node: { type: "blockquote", children: parseMarkdown(chunk.join("\n"), options) },
    next: i,
  };
}

/** 抽取链接定义与脚注定义，返回剩余行。 */
function extractDefs(lines: string[]): {
  lines: string[];
  linkDefs: Record<string, LinkDef>;
  footnotes: FootnoteDef[];
} {
  const linkDefs: Record<string, LinkDef> = {};
  const footnotes: FootnoteDef[] = [];
  const kept: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 脚注 [^id]: ...
    const fn = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
    if (fn) {
      const id = fn[1];
      const first = fn[2];
      const chunk: string[] = [first];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          // 空行：若后面仍是缩进续写则保留，否则结束
          if (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
            chunk.push("");
            i += 1;
            continue;
          }
          break;
        }
        if (
          /^\s{2,}/.test(next) ||
          (/^\s+/.test(next) && !/^\[\^/.test(next.trim()) && !/^\[[^\]]+\]:/.test(next.trim()))
        ) {
          chunk.push(next.replace(/^\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      footnotes.push({
        id,
        children: parseMarkdown(chunk.join("\n").trim(), {}),
      });
      continue;
    }

    // 链接定义 [id]: url "title"
    const ld = /^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/.exec(line.trim());
    if (ld && !line.trim().startsWith("[^")) {
      const id = ld[1].trim().toLowerCase();
      linkDefs[id] = { href: ld[2].replace(/^<|>$/g, ""), title: ld[3] };
      i += 1;
      continue;
    }

    kept.push(line);
    i += 1;
  }

  return { lines: kept, linkDefs, footnotes };
}

/** 定义列表：term 行后跟 `: ` 定义。 */
function parseDefinitionList(
  lines: string[],
  start: number,
  options: ParseOptions,
): { node: BlockNode; next: number } | null {
  if (start + 1 >= lines.length) return null;
  if (!/^:\s+\S/.test(lines[start + 1]) && !/^:\s*$/.test(lines[start + 1])) {
    // 允许 `: definition`
    if (!/^:\s+/.test(lines[start + 1])) return null;
  }
  // term 不能是列表/标题/围栏等
  const termLine = lines[start];
  if (
    !termLine.trim() ||
    termLine.startsWith("#") ||
    matchFenceOpen(termLine) ||
    /^>\s?/.test(termLine) ||
    /^\s*([-*+]|\d+\.)\s+/.test(termLine) ||
    termLine.trim().startsWith("|")
  ) {
    return null;
  }
  if (!/^:\s+/.test(lines[start + 1])) return null;

  const items: DefinitionItem[] = [];
  let i = start;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    if (i + 1 >= lines.length || !/^:\s+/.test(lines[i + 1])) break;
    if (
      lines[i].startsWith("#") ||
      matchFenceOpen(lines[i]) ||
      /^>\s?/.test(lines[i]) ||
      /^\s*([-*+]|\d+\.)\s+/.test(lines[i])
    ) {
      break;
    }

    const term = parseInline(lines[i].trim(), options);
    i += 1;
    const definitions: BlockNode[][] = [];

    while (i < lines.length && /^:\s+/.test(lines[i])) {
      const first = lines[i].replace(/^:\s+/, "");
      const chunk: string[] = [first];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          if (
            i + 1 < lines.length &&
            (/^\s{2,}\S/.test(lines[i + 1]) || /^:\s+/.test(lines[i + 1]))
          ) {
            chunk.push("");
            i += 1;
            continue;
          }
          break;
        }
        if (/^:\s+/.test(next)) break;
        if (
          next.startsWith("#") ||
          matchFenceOpen(next) ||
          /^>\s?/.test(next) ||
          /^\s*([-*+]|\d+\.)\s+/.test(next) ||
          (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && !/^\s/.test(next))
        ) {
          // 下一 term：未缩进且后面是 :
          if (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && indentOf(next) === 0) {
            break;
          }
          if (
            next.startsWith("#") ||
            matchFenceOpen(next) ||
            /^>\s?/.test(next) ||
            /^\s*([-*+]|\d+\.)\s+/.test(next)
          ) {
            break;
          }
        }
        if (/^\s{2,}/.test(next) || indentOf(next) > 0) {
          chunk.push(next.replace(/^\s+/, ""));
          i += 1;
          continue;
        }
        // 同缩进非 : 行 → 可能是下一 term
        if (i + 1 < lines.length && /^:\s+/.test(lines[i + 1])) break;
        chunk.push(next);
        i += 1;
      }
      definitions.push(parseMarkdown(chunk.join("\n").trim(), options));
    }

    if (definitions.length === 0) break;
    items.push({ term, definitions });
  }

  if (!items.length) return null;
  return { node: { type: "definitionList", items }, next: i };
}

function isBlockStart(line: string, streaming: boolean, lines: string[], i: number): boolean {
  if (!line.trim()) return true;
  if (isAtxHeading(line)) return true;
  if (matchFenceOpen(line)) return true;
  if (/^>\s?/.test(line)) return true;
  if (/^\s*([-*+]|\d+\.)\s+/.test(line)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) return true;
  if (isTableHeaderAt(lines, i)) return true;
  if (streaming && isPipeTableLine(line) && !isTableHeaderAt(lines, i)) return true;
  if (line.trim().startsWith("$$")) return true;
  if (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && indentOf(line) === 0) return true;
  return false;
}

/** 流式表格：仅当表是文末块且缓冲区未以换行闭合时标 incomplete。 */
function isStreamingTableIncomplete(rawMd: string, tableNext: number, lines: string[]): boolean {
  const restBlank = lines.slice(tableNext).every((l) => !l.trim());
  if (!restBlank) return false;
  const normalized = rawMd.replace(/\r\n/g, "\n");
  return !normalized.endsWith("\n");
}

/** 解析块序列（内部）。 */
function parseBlocks(lines: string[], options: ParseOptions, rawMd: string): BlockNode[] {
  const streaming = Boolean(options.streaming);
  const out: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const startI = i;
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push({ type: "hr" });
      i += 1;
      continue;
    }

    // 数学块 $$
    if (line.trim().startsWith("$$")) {
      const trimmed = line.trim();
      if (trimmed === "$$" || trimmed.startsWith("$$")) {
        const sameLine = trimmed.length > 2 && trimmed.endsWith("$$") && trimmed !== "$$";
        if (sameLine) {
          const value = trimmed.slice(2, -2).trim();
          out.push({ type: "math", value, display: true });
          i += 1;
          continue;
        }
        i += 1;
        const buf: string[] = [];
        let closed = false;
        while (i < lines.length) {
          if (lines[i].trim() === "$$" || lines[i].trim().endsWith("$$")) {
            const t = lines[i].trim();
            if (t !== "$$") buf.push(t.replace(/\$\$$/, ""));
            closed = true;
            i += 1;
            break;
          }
          buf.push(lines[i]);
          i += 1;
        }
        const value = buf.join("\n");
        if (streaming && !closed) {
          out.push({ type: "pending", kind: "math", value: `$$\n${value}` });
        } else {
          out.push({ type: "math", value, display: true, incomplete: streaming && !closed });
        }
        continue;
      }
    }

    const fence = matchFenceOpen(line);
    if (fence) {
      const { ch, count, meta } = fence;
      const [lang, ...rest] = meta.split(/\s+/);
      i += 1;
      const buf: string[] = [];
      let closed = false;
      while (i < lines.length) {
        if (isFenceClose(lines[i], ch, count)) {
          closed = true;
          i += 1;
          break;
        }
        buf.push(lines[i]);
        i += 1;
      }
      const value = buf.join("\n");
      const language = (lang || "").toLowerCase();
      const incomplete = streaming && !closed;
      if (language === "mermaid") {
        out.push({ type: "diagram", lang: language, value, incomplete });
      } else {
        out.push({
          type: "code",
          lang: language,
          value,
          meta: rest.join(" ") || undefined,
          incomplete,
        });
      }
      continue;
    }

    // 流式：尚无分隔行的管道表 → pending
    if (streaming && isPipeTableLine(line) && !isTableHeaderAt(lines, i)) {
      const buf: string[] = [];
      while (i < lines.length && isPipeTableLine(lines[i]!) && !isTableHeaderAt(lines, i)) {
        buf.push(lines[i]!);
        i += 1;
      }
      out.push({ type: "pending", kind: "table", value: buf.join("\n") });
      continue;
    }

    if (isTableHeaderAt(lines, i)) {
      const table = parseTable(lines, i, options);
      if (table) {
        const node = table.node;
        if (streaming && node.type === "table") {
          out.push({
            ...node,
            incomplete: isStreamingTableIncomplete(rawMd, table.next, lines),
          });
        } else {
          out.push(node);
        }
        i = table.next;
        continue;
      }
    }

    if (/^>\s?/.test(line)) {
      const quote = parseBlockquote(lines, i, options);
      out.push(quote.node);
      i = quote.next;
      continue;
    }

    const heading = ATX_HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = heading[2].trim();
      out.push({
        type: "heading",
        level,
        id: headingId(text),
        children: parseInline(text, options),
      });
      i += 1;
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const list = parseList(lines, i, options);
      if (list) {
        out.push(list.node);
        i = list.next;
        continue;
      }
    }

    // 定义列表
    const dl = parseDefinitionList(lines, i, options);
    if (dl) {
      out.push(dl.node);
      i = dl.next;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], streaming, lines, i)) {
      // 若当前行是 term 且下一行是 : 定义，停在段落外交给 dl
      if (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && indentOf(lines[i]) === 0) {
        break;
      }
      para.push(lines[i]);
      i += 1;
    }
    // 若因为 dl 停下且 para 为空，循环继续会进 dl；若 para 有内容先输出
    if (para.length) {
      out.push({ type: "paragraph", children: parseInline(para.join("\n"), options) });
    } else if (i < lines.length && i + 1 < lines.length && /^:\s+/.test(lines[i + 1])) {
      const dl2 = parseDefinitionList(lines, i, options);
      if (dl2) {
        out.push(dl2.node);
        i = dl2.next;
      } else {
        // 无法解析则当段落吃掉一行，避免死循环
        out.push({ type: "paragraph", children: parseInline(lines[i], options) });
        i += 1;
      }
    }

    // 兜底：本轮未推进则强制吃一行，防止同类死循环
    if (i === startI) {
      out.push({ type: "paragraph", children: parseInline(lines[i]!, options) });
      i += 1;
    }
  }

  return out;
}

/** 解析完整文档（含脚注与链接定义）。 */
export function parseMarkdownDocument(md: string, options: ParseOptions = {}): MarkdownDocument {
  const source = parseFrontmatter(md ?? "").body;
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  const { lines, linkDefs, footnotes } = extractDefs(rawLines);
  const mergedDefs = { ...linkDefs, ...(options.linkDefs ?? {}) };
  const opts: ParseOptions = { ...options, linkDefs: mergedDefs };
  const blocks = parseBlocks(lines, opts, md ?? "");
  return { blocks, footnotes, linkDefs: mergedDefs };
}

/** 解析完整 markdown 文档为块级 AST（会剥离 frontmatter 与链接/脚注定义）。 */
export function parseMarkdown(md: string, options: ParseOptions = {}): BlockNode[] {
  return parseMarkdownDocument(md, options).blocks;
}
