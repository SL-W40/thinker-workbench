/**
 * 块级解析主循环与对外入口。
 *
 * 各块类型实现分散在同级子模块里；主循环把 `parseFragment`（二次解析入口）
 * 以参数注入给需要递归的实现，因此依赖方向始终是「主循环 → 子模块」。
 */
import { cacheGet, cacheSet, documentCache } from "../../cache";
import type { BlockNode, MarkdownDocument } from "../../types";
import { parseInline } from "../inline";
import type { ParseOptions } from "../options";
import { parseBlockquote } from "./blockquote";
import { isBlockStart, isDefinitionStart } from "./blockStart";
import { parseIndentedCode } from "./codeBlock";
import {
  headingId,
  indentOf,
  isFenceClose,
  isThematicBreak,
  matchFenceOpen,
  plainInline,
  stripLeadingSpaces,
} from "./common";
import { parseDefinitionList } from "./definitionList";
import { extractDefs } from "./definitions";
import { dedupeHeadingIds, matchAtx, setextLevel } from "./heading";
import { matchListMarker, parseList } from "./list";
import { isPipeTableLine, isStreamingTableIncomplete, isTableHeaderAt, parseTable } from "./table";

export function parseBlocks(lines: string[], options: ParseOptions, rawMd: string): BlockNode[] {
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
      while (i < lines.length) {
        const cur = lines[i];
        if (!cur || !isPipeTableLine(cur) || isTableHeaderAt(lines, i)) break;
        buf.push(cur);
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
      const quote = parseBlockquote(lines, i, options, parseFragment);
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
      const list = parseList(lines, i, options, parseFragment);
      if (list) {
        out.push(list.node);
        i = list.next;
        continue;
      }
    }

    // 定义列表
    const dl = parseDefinitionList(lines, i, options, parseFragment);
    if (dl) {
      out.push(dl.node);
      i = dl.next;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !isBlockStart(lines[i] ?? "", streaming, lines, i)
    ) {
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
      const dl2 = parseDefinitionList(lines, i, options, parseFragment);
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
export function parseFragment(md: string, options: ParseOptions): BlockNode[] {
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
  // 只在「无自定义选项」时走缓存：调用方传入 linkDefs / streaming 等会改变结果。
  // 长文档才值得缓存，短文档解析本身很快，缓存只占地方。
  const cacheable = Object.keys(options).length === 0 && source.length >= 400;

  if (cacheable) {
    const hit = cacheGet<MarkdownDocument>(documentCache, source);
    if (hit) return hit;
  }

  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  const { lines, linkDefs, footnotes } = extractDefs(rawLines, parseFragment);
  const mergedDefs = { ...linkDefs, ...(options.linkDefs ?? {}) };
  const opts: ParseOptions = { ...options, linkDefs: mergedDefs };
  const blocks = parseBlocks(lines, opts, md ?? "");
  const seen = new Map<string, number>();
  dedupeHeadingIds(blocks, seen);
  for (const note of footnotes) dedupeHeadingIds(note.children, seen);
  const doc: MarkdownDocument = { blocks, footnotes, linkDefs: mergedDefs };

  if (cacheable) cacheSet(documentCache, source, doc, source.length);
  return doc;
}

/** 解析完整 markdown 文档为块级 AST（会剥离链接/脚注定义）。 */
export function parseMarkdown(md: string, options: ParseOptions = {}): BlockNode[] {
  return parseMarkdownDocument(md, options).blocks;
}
