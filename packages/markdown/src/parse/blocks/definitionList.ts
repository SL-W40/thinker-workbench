/**
 * 定义列表：term 行 + `:` 起始的定义体（定义体内可再嵌任意块）。
 */
import type { BlockNode, DefinitionItem } from "../../types";
import { parseInline } from "../inline";
import type { ParseOptions } from "../options";
import { type FragmentParser, indentOf, matchFenceOpen } from "./common";
import { matchAtx } from "./heading";
import { matchListMarker } from "./list";

export function parseDefinitionList(
  lines: string[],
  start: number,
  options: ParseOptions,
  parseNested: FragmentParser,
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
          matchListMarker(next) ||
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
      definitions.push(parseNested(chunk.join("\n").trim(), options));
    }

    if (definitions.length === 0) break;
    items.push({ term, definitions });
  }

  if (!items.length) return null;
  return { node: { type: "definitionList", items }, next: i };
}
