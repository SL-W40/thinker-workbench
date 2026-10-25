/**
 * 块级解析的通用原语：缩进、主题分隔线、围栏、标题锚点、行内节点取文本。
 * 被其它 blocks/* 子模块单向依赖，自身不反向依赖任何子模块。
 */
import type { BlockNode, InlineNode } from "../../types";
import type { ParseOptions } from "../options";

/** 嵌套块解析回调：把一段文本交回主循环再解析一次（列表项、引用体、定义内容都用）。 */
export type FragmentParser = (md: string, options: ParseOptions) => BlockNode[];

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function indentOf(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].replace(/\t/g, "    ").length : 0;
}

export function stripLeadingSpaces(line: string, count: number): string {
  let i = 0;
  while (i < count && i < line.length && line[i] === " ") i += 1;
  return line.slice(i);
}

export function isThematicBreak(line: string): boolean {
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
}

export function plainInline(nodes: InlineNode[]): string {
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

export function matchFenceOpen(
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

export function isFenceClose(line: string, ch: "`" | "~", count: number): boolean {
  return new RegExp(`^ {0,3}${ch === "`" ? "`" : "~"}{${count},}[ \\t]*$`).test(line);
}

export function sliceContentColumn(line: string, cols: number): string {
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
