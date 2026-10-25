/**
 * 列表（有序 / 无序 / 任务项）：识别标记符、按缩进切分列表项并递归解析子内容。
 * 嵌套内容由调用方以 `parseNested` 注入，避免与本模块形成反向依赖。
 */
import type { BlockNode, ListItem } from "../../types";
import { parseInline } from "../inline";
import type { ParseOptions } from "../options";
import { type FragmentParser, indentOf, sliceContentColumn } from "./common";

type ListMarker = {
  indent: string;
  ordered: boolean;
  number: string;
  delim: "." | ")";
  spacing: string;
  body: string;
};

/** 无序列表，或 `.` / `)` 有序列表。 */
export function matchListMarker(line: string): ListMarker | null {
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

export function parseList(
  lines: string[],
  start: number,
  options: ParseOptions,
  parseNested: FragmentParser,
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

    const children = parseNested(chunk.join("\n").replace(/\n+$/, ""), options);
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
