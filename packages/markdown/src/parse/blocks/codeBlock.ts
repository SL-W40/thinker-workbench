/**
 * 缩进代码块：4 空格缩进起头，保留中间空行但丢弃尾部空行。
 */
import type { BlockNode } from "../../types";
import { indentOf, sliceContentColumn } from "./common";

export function parseIndentedCode(
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
  return {
    node: { type: "code", lang: "", value: buf.join("\n") },
    next: i - pendingBlanks.length,
  };
}
