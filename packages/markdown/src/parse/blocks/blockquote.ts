/**
 * 引用块：`>` 标记剥离、GitHub Alert 提示（NOTE / TIP / CAUTION）识别与嵌套解析。
 */
import type { AlertKind, BlockNode } from "../../types";
import type { ParseOptions } from "../options";
import { isBlockStart } from "./blockStart";
import { type FragmentParser, stripLeadingSpaces } from "./common";

export function stripBlockquoteMarker(line: string): string | null {
  const matched = /^( {0,3}>)([ \t])?(.*)$/.exec(line);
  if (!matched) return null;
  return matched[3] ?? "";
}

const ALERT_SOLO = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
const ALERT_INLINE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]+(.*)$/i;

export function takeAlert(chunk: string[]): AlertKind | undefined {
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

export function parseBlockquote(
  lines: string[],
  start: number,
  options: ParseOptions,
  parseNested: FragmentParser,
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
  const children = parseNested(chunk.join("\n"), options);
  return {
    node: alert ? { type: "blockquote", alert, children } : { type: "blockquote", children },
    next: i,
  };
}
