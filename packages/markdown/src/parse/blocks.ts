/**
 * 块级 Markdown 解析：标题、列表、表格、围栏、定义列表、脚注、数学块等。
 */
import type {
  AlertKind,
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

/** ATX 标题：最多 3 个前导空格，`#` 后必须有空白，并去掉收尾井号。 */
function matchAtx(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  const matched = /^( {0,3})(#{1,6})([ \t]+)(.*)$/.exec(line);
  if (!matched) return null;
  const text = (matched[4] ?? "").replace(/[ \t]+#+\s*$/, "").trim();
  if (!text) return null;
  return { level: matched[2].length as 1 | 2 | 3 | 4 | 5 | 6, text };
}

function isTableSep(line: string): boolean {
  const t = line.trim();
  // 必须含管道，避免把 Setext 下划线 `---` 当成单列表格分隔行
  if (!t.includes("|")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(t);
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
  return i + 1 < lines.length && lines[i]?.includes("|") && isTableSep(lines[i + 1]!);
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

function stripLeadingSpaces(line: string, count: number): string {
  let i = 0;
  while (i < count && i < line.length && line[i] === " ") i += 1;
  return line.slice(i);
}

type ListMarker = {
  indent: string;
  ordered: boolean;
  number: string;
  delim: "." | ")";
  spacing: string;
  body: string;
};

/** 无序列表，或 `.` / `)` 有序列表。 */
function matchListMarker(line: string): ListMarker | null {
  const ul = /^(\s*)([-*+])(\s+)(.*)$/.exec(line);
  if (ul) {
    return {
      indent: ul[1] ?? "",
      ordered: false,
      number: "",
      delim: ".",
      spacing: ul[3] ?? " ",
      body: ul[4] ?? "",
    };
  }
  const ol = /^(\s*)(\d+)([.)])(\s+)(.*)$/.exec(line);
  if (!ol) return null;
  return {
    indent: ol[1] ?? "",
    ordered: true,
    number: ol[2] ?? "1",
    delim: ol[3] === ")" ? ")" : ".",
    spacing: ol[4] ?? " ",
    body: ol[5] ?? "",
  };
}

/** 三个以上 `-` / `*` / `_`，中间可以有空格。 */
function isThematicBreak(line: string): boolean {
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
}

/** Setext 下划线：`=` 为一级，`-` 为二级。 */
function setextLevel(line: string): 1 | 2 | null {
  const matched = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
  if (!matched) return null;
  return matched[1]?.startsWith("=") ? 1 : 2;
}

/** 引用标记：最多 3 个前导空格，只剥掉 `>` 后的一个空白。 */
function stripBlockquoteMarker(line: string): string | null {
  const matched = /^( {0,3}>)([ \t])?(.*)$/.exec(line);
  if (!matched) return null;
  return matched[3] ?? "";
}

function plainInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "code" || node.type === "kbd") return node.value;
      if (node.type === "autolink") return node.text;
      if (node.type === "math") return node.value;
      if (node.type === "image") return node.alt;
      if (node.type === "break") return " ";
      if ("children" in node && node.children) return plainInline(node.children);
      return "";
    })
    .join("");
}

function dedupeHeadingIds(blocks: BlockNode[], seen: Map<string, number>): void {
  for (const block of blocks) {
    if (block.type === "heading") {
      const base = block.id || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      block.id = count === 0 ? base : `${base}-${count}`;
    } else if (block.type === "blockquote") {
      dedupeHeadingIds(block.children, seen);
    } else if (block.type === "list") {
      for (const item of block.items) dedupeHeadingIds(item.children, seen);
    } else if (block.type === "definitionList") {
      for (const item of block.items) {
        for (const def of item.definitions) dedupeHeadingIds(def, seen);
      }
    }
  }
}

/** 匹配围栏开行：允许最多 3 个前导空格。 */
function matchFenceOpen(
  line: string,
): { ch: "`" | "~"; count: number; meta: string; indent: number } | null {
  const matched = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!matched) return null;
  const fence = matched[2] ?? "";
  const ch = fence[0] as "`" | "~";
  const meta = (matched[3] ?? "").trim();
  // 反引号围栏的信息串里不能再出现反引号
  if (ch === "`" && meta.includes("`")) return null;
  return { ch, count: fence.length, meta, indent: (matched[1] ?? "").length };
}

function isFenceClose(line: string, ch: "`" | "~", count: number): boolean {
  return new RegExp(`^ {0,3}${ch === "`" ? "`" : "~"}{${count},}[ \\t]*$`).test(line);
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
  const first = lines[start] ?? "";
  const firstMarker = matchListMarker(first);
  if (!firstMarker) return null;

  const ordered = firstMarker.ordered;
  const delim = firstMarker.delim;
  const baseIndent = indentOf(first);
  const startNum = ordered ? Number(firstMarker.number) : undefined;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const ind = indentOf(line);
    if (ind < baseIndent) break;

    const marker = matchListMarker(line);
    if (!marker || marker.ordered !== ordered || indentOf(line) !== baseIndent) break;
    if (ordered && marker.delim !== delim) break;

    // 内容列 = 缩进 + marker（含有序的 `.` / `)`）+ 随后空白
    const indentWidth = marker.indent.replace(/\t/g, "    ").length;
    const markerWidth = ordered ? marker.number.length + 1 : 1;
    const contentCol = indentWidth + markerWidth + marker.spacing.replace(/\t/g, "    ").length;

    let body = marker.body;
    let task = false;
    let checked = false;
    // `]` 后可以没有正文（空任务项），但不能紧贴文字（`[x]done` 仍是普通列表）
    const taskMatch = /^\[([ xX])\](?:[ \t]+([\s\S]*))?$/.exec(body);
    if (taskMatch) {
      task = true;
      checked = (taskMatch[1] ?? "").toLowerCase() === "x";
      body = taskMatch[2] ?? "";
    }

    i += 1;
    const chunk: string[] = [body];
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (!next.trim()) {
        chunk.push("");
        i += 1;
        continue;
      }
      const nextInd = indentOf(next);
      if (nextInd <= baseIndent) break;
      const nested = matchListMarker(next);
      if (nested && nextInd === baseIndent) break;
      chunk.push(sliceContentColumn(next, contentCol));
      i += 1;
    }

    const children = parseFragment(chunk.join("\n").replace(/\n+$/, ""), options);
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

const ALERT_SOLO = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
const ALERT_INLINE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]+(.*)$/i;

function takeAlert(chunk: string[]): AlertKind | undefined {
  if (!chunk.length) return undefined;
  const line = (chunk[0] ?? "").trim();
  const solo = ALERT_SOLO.exec(line);
  if (solo) {
    chunk.shift();
    return solo[1].toLowerCase() as AlertKind;
  }
  const inline = ALERT_INLINE.exec(line);
  if (!inline) return undefined;
  const rest = inline[2] ?? "";
  if (rest.trim()) chunk[0] = rest;
  else chunk.shift();
  return inline[1].toLowerCase() as AlertKind;
}

function parseBlockquote(
  lines: string[],
  start: number,
  options: ParseOptions,
): { node: BlockNode; next: number } {
  const chunk: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const quoted = stripBlockquoteMarker(line);
    if (quoted !== null) {
      chunk.push(quoted);
      i += 1;
      continue;
    }
    // 空行结束引用；非空且不是新块时，按懒延续并进同一段
    if (!line.trim() || isBlockStart(line, Boolean(options.streaming), lines, i)) break;
    chunk.push(line);
    i += 1;
  }
  const alert = takeAlert(chunk);
  const children = parseFragment(chunk.join("\n"), options);
  return {
    node: alert ? { type: "blockquote", alert, children } : { type: "blockquote", children },
    next: i,
  };
}

/**
 * 围栏、数学块、缩进代码里的行不能抽成链接定义或脚注。
 * 否则代码示例里的 `[id]: url` 会从样例中消失。
 */
function markOpaqueLines(lines: string[]): boolean[] {
  const opaque = new Array<boolean>(lines.length).fill(false);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (indentOf(line) >= 4 && line.trim()) {
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (!current.trim()) {
          let j = i + 1;
          while (j < lines.length && !(lines[j] ?? "").trim()) j += 1;
          if (j < lines.length && indentOf(lines[j] ?? "") >= 4) {
            opaque[i] = true;
            i += 1;
            continue;
          }
          break;
        }
        if (indentOf(current) < 4) break;
        opaque[i] = true;
        i += 1;
      }
      continue;
    }

    const fence = matchFenceOpen(line);
    if (fence) {
      opaque[i] = true;
      i += 1;
      while (i < lines.length && !isFenceClose(lines[i] ?? "", fence.ch, fence.count)) {
        opaque[i] = true;
        i += 1;
      }
      if (i < lines.length) {
        opaque[i] = true;
        i += 1;
      }
      continue;
    }

    const trimmed = line.trim();
    if (indentOf(line) <= 3 && trimmed.startsWith("$$")) {
      opaque[i] = true;
      const sameLine = trimmed.length > 2 && trimmed.endsWith("$$");
      i += 1;
      if (!sameLine) {
        while (i < lines.length) {
          opaque[i] = true;
          const mathLine = (lines[i] ?? "").trim();
          i += 1;
          if (mathLine === "$$" || mathLine.endsWith("$$")) break;
        }
      }
      continue;
    }

    i += 1;
  }
  return opaque;
}

function readLinkDestination(rest: string): { href: string; rest: string } | null {
  if (rest.startsWith("<")) {
    let href = "";
    let i = 1;
    while (i < rest.length) {
      if (rest[i] === "\\" && i + 1 < rest.length) {
        href += rest[i + 1];
        i += 2;
        continue;
      }
      if (rest[i] === ">") return { href, rest: rest.slice(i + 1) };
      href += rest[i];
      i += 1;
    }
    return null;
  }
  const matched = /^(\S+)/.exec(rest);
  if (!matched?.[1]) return null;
  return { href: matched[1], rest: rest.slice(matched[1].length) };
}

function readSameLineTitle(rest: string): string | undefined {
  const matched = /^[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))[ \t]*$/.exec(rest);
  if (!matched) return undefined;
  return matched[1] ?? matched[2] ?? matched[3];
}

function readNextLineTitle(line: string): string | null {
  const matched = /^ {0,3}(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))[ \t]*$/.exec(line);
  if (!matched) return null;
  return matched[1] ?? matched[2] ?? matched[3] ?? "";
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
  const opaque = markOpaqueLines(lines);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (opaque[i]) {
      kept.push(line);
      i += 1;
      continue;
    }

    // 脚注 [^id]: ...（最多 3 个前导空格，避免吃掉缩进代码）
    const fn = /^ {0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(line);
    if (fn) {
      const id = fn[1] ?? "";
      const chunk: string[] = [fn[2] ?? ""];
      i += 1;
      while (i < lines.length && !opaque[i]) {
        const next = lines[i] ?? "";
        if (!next.trim()) {
          if (i + 1 < lines.length && !opaque[i + 1] && /^\s{2,}\S/.test(lines[i + 1] ?? "")) {
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
        children: parseFragment(chunk.join("\n").trim(), {}),
      });
      continue;
    }

    // 链接定义 [id]: <url> "title"，标题可以写在下一行
    const head = /^ {0,3}\[([^\]]+)\]:[ \t]*/.exec(line);
    if (head && !(head[1] ?? "").startsWith("^")) {
      const dest = readLinkDestination(line.slice(head[0].length));
      if (dest?.href) {
        let title: string | undefined;
        let next = i + 1;
        if (dest.rest.trim()) {
          title = readSameLineTitle(dest.rest);
          if (title === undefined) {
            kept.push(line);
            i += 1;
            continue;
          }
        } else if (next < lines.length && !opaque[next]) {
          const nextTitle = readNextLineTitle(lines[next] ?? "");
          if (nextTitle !== null) {
            title = nextTitle;
            next += 1;
          }
        }
        linkDefs[(head[1] ?? "").trim().toLowerCase()] = { href: dest.href, title };
        i = next;
        continue;
      }
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
  // term 不能是列表/标题/围栏等，也不能以冒号结尾（避免把 "Note:" 下一行吃成定义）
  const termLine = lines[start] ?? "";
  if (
    !termLine.trim() ||
    /[:：]\s*$/.test(termLine.trim()) ||
    matchAtx(termLine) ||
    matchFenceOpen(termLine) ||
    /^ {0,3}>/.test(termLine) ||
    matchListMarker(termLine) ||
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
      matchFenceOpen(lines[i] ?? "") ||
      /^ {0,3}>/.test(lines[i] ?? "") ||
      matchListMarker(lines[i] ?? "")
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
          /^ {0,3}>/.test(next) ||
          Boolean(matchListMarker(next)) ||
          (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && !/^\s/.test(next))
        ) {
          // 下一 term：未缩进且后面是 :
          if (i + 1 < lines.length && /^:\s+/.test(lines[i + 1]) && indentOf(next) === 0) {
            break;
          }
          if (
            next.startsWith("#") ||
            matchFenceOpen(next) ||
            /^ {0,3}>/.test(next) ||
            matchListMarker(next)
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
      definitions.push(parseFragment(chunk.join("\n").trim(), options));
    }

    if (definitions.length === 0) break;
    items.push({ term, definitions });
  }

  if (!items.length) return null;
  return { node: { type: "definitionList", items }, next: i };
}

function isDefinitionStart(lines: string[], i: number): boolean {
  if (i + 1 >= lines.length || indentOf(lines[i] ?? "") !== 0) return false;
  if (!/^:[ \t]+\S/.test(lines[i + 1] ?? "")) return false;
  const term = (lines[i] ?? "").trim();
  if (!term || /[:：]\s*$/.test(term)) return false;
  if (matchAtx(lines[i] ?? "") || matchFenceOpen(lines[i] ?? "") || isThematicBreak(lines[i] ?? "")) {
    return false;
  }
  if (matchListMarker(lines[i] ?? "") || /^ {0,3}>/.test(lines[i] ?? "")) return false;
  return true;
}

function isBlockStart(line: string, streaming: boolean, lines: string[], i: number): boolean {
  if (!line.trim()) return true;
  if (matchAtx(line) || matchFenceOpen(line) || /^ {0,3}>/.test(line)) return true;
  if (matchListMarker(line) && indentOf(line) <= 3) return true;
  if (isThematicBreak(line) || setextLevel(line) !== null) return true;
  if (isTableHeaderAt(lines, i)) return true;
  if (streaming && isPipeTableLine(line) && !isTableHeaderAt(lines, i)) return true;
  if (indentOf(line) <= 3 && line.trim().startsWith("$$")) return true;
  if (indentOf(line) >= 4) return true;
  if (isDefinitionStart(lines, i)) return true;
  return false;
}

/** 四空格（或 tab）缩进代码块；末尾空行留给后面的块。 */
function parseIndentedCode(
  lines: string[],
  start: number,
): { node: BlockNode; next: number } | null {
  if (indentOf(lines[start] ?? "") < 4 || !(lines[start] ?? "").trim()) return null;
  const buf: string[] = [];
  const pendingBlanks: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      pendingBlanks.push("");
      i += 1;
      continue;
    }
    if (indentOf(line) < 4) break;
    buf.push(...pendingBlanks, sliceContentColumn(line, 4));
    pendingBlanks.length = 0;
    i += 1;
  }
  if (!buf.length) return null;
  return { node: { type: "code", lang: "", value: buf.join("\n") }, next: i - pendingBlanks.length };
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
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isThematicBreak(line)) {
      out.push({ type: "hr" });
      i += 1;
      continue;
    }

    // 数学块 $$（四空格缩进留给代码块）
    if (indentOf(line) <= 3 && line.trim().startsWith("$$")) {
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
        const fenceLine = lines[i] ?? "";
        if (isFenceClose(fenceLine, ch, count)) {
          closed = true;
          i += 1;
          break;
        }
        buf.push(stripLeadingSpaces(fenceLine, fence.indent));
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

    if (/^ {0,3}>/.test(line)) {
      const quote = parseBlockquote(lines, i, options);
      out.push(quote.node);
      i = quote.next;
      continue;
    }

    const heading = matchAtx(line);
    if (heading) {
      const children = parseInline(heading.text, options);
      out.push({
        type: "heading",
        level: heading.level,
        id: headingId(plainInline(children)) || "section",
        children,
      });
      i += 1;
      continue;
    }

    if (indentOf(line) >= 4) {
      const indented = parseIndentedCode(lines, i);
      if (indented) {
        out.push(indented.node);
        i = indented.next;
        continue;
      }
    }

    if (matchListMarker(line) && indentOf(line) <= 3) {
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
    while (i < lines.length && (lines[i] ?? "").trim() && !isBlockStart(lines[i] ?? "", streaming, lines, i)) {
      if (isDefinitionStart(lines, i)) break;
      para.push(lines[i] ?? "");
      i += 1;
    }
    const underline = i < lines.length ? setextLevel(lines[i] ?? "") : null;
    if (para.length && underline) {
      const children = parseInline(para.join("\n"), options);
      out.push({
        type: "heading",
        level: underline,
        id: headingId(plainInline(children)) || "section",
        children,
      });
      i += 1;
    } else if (para.length) {
      out.push({ type: "paragraph", children: parseInline(para.join("\n"), options) });
    } else if (isDefinitionStart(lines, i)) {
      const dl2 = parseDefinitionList(lines, i, options);
      if (dl2) {
        out.push(dl2.node);
        i = dl2.next;
      } else {
        // 无法解析则当段落吃掉一行，避免死循环
        out.push({ type: "paragraph", children: parseInline(lines[i] ?? "", options) });
        i += 1;
      }
    }

    // 兜底：本轮未推进则强制吃一行，防止同类死循环
    if (i === startI) {
      out.push({ type: "paragraph", children: parseInline(lines[i] ?? "", options) });
      i += 1;
    }
  }

  return out;
}

/**
 * 解析列表项、引用、脚注正文。
 * 不再次抽取链接定义，避免把代码块里的 `[id]: url` 从内层抽掉后丢掉。
 */
function parseFragment(md: string, options: ParseOptions): BlockNode[] {
  const source = md ?? "";
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  return parseBlocks(lines, options, source);
}

/**
 * 解析完整文档（含脚注与链接定义）。
 * 聊天正文里的 `---` 是分隔线，不能当成 frontmatter 剥掉，否则两道分隔线之间的正文会整段消失。
 */
export function parseMarkdownDocument(md: string, options: ParseOptions = {}): MarkdownDocument {
  const source = md ?? "";
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  const { lines, linkDefs, footnotes } = extractDefs(rawLines);
  const mergedDefs = { ...linkDefs, ...(options.linkDefs ?? {}) };
  const opts: ParseOptions = { ...options, linkDefs: mergedDefs };
  const blocks = parseBlocks(lines, opts, md ?? "");
  const seen = new Map<string, number>();
  dedupeHeadingIds(blocks, seen);
  for (const note of footnotes) dedupeHeadingIds(note.children, seen);
  return { blocks, footnotes, linkDefs: mergedDefs };
}

/** 解析完整 markdown 文档为块级 AST（会剥离链接/脚注定义）。 */
export function parseMarkdown(md: string, options: ParseOptions = {}): BlockNode[] {
  return parseMarkdownDocument(md, options).blocks;
}
