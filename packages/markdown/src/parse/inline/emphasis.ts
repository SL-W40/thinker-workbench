/**
 * 强调类行内标记：`*`/`_` 的粗斜体（含 `***` 三连），以及 `~~ == ~ ^` 的删除线 / 高亮 / 上下标。
 *
 * 这些标记的内容里可能嵌任意行内结构，需要回调主循环；
 * 主循环以 `parseNested` 注入，避免子模块反向依赖驱动DFS 形成环。
 */
import type { InlineNode } from "../../types";
import type { ParseOptions } from "../options";
import { canOpenEmphasis, findClosingParen } from "./scan";

/** 行内解析回调：把一段文本交回主循环再解析一次。 */
export type InlineParser = (md: string, options: ParseOptions) => InlineNode[];

/** CommonMark 可转义 ASCII 标点。 */
export const ESCAPABLE = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

export function parseEmphasisChunk(
  s: string,
  i: number,
  marker: "*" | "_",
  double: boolean,
  streaming: boolean,
  options: ParseOptions,
  parseNested: InlineParser,
): { nodes: InlineNode[]; next: number } | null {
  const runWanted = double ? 2 : 1;
  let run = 0;
  while (s[i + run] === marker) run += 1;
  if (run < runWanted) return null;
  if (!canOpenEmphasis(s, i, marker, runWanted)) return null;

  // ***foo*** → strong(emphasis(foo))
  if (run >= 3 && !double) {
    const triple = marker.repeat(3);
    const close3 = s.indexOf(triple, i + 3);
    if (close3 > i) {
      const inner = s.slice(i + 3, close3);
      if (inner) {
        const children = parseNested(inner, options);
        return {
          nodes: [{ type: "strong", children: [{ type: "emphasis", children }] }],
          next: close3 + 3,
        };
      }
    }
  }

  const token = marker.repeat(runWanted);
  if (!s.startsWith(token, i)) return null;
  const close = s.indexOf(token, i + token.length);
  if (close < 0) {
    if (streaming) return null;
    return null;
  }
  const inner = s.slice(i + token.length, close);
  if (!inner) return null;
  const children = parseNested(inner, options);
  const node: InlineNode = double ? { type: "strong", children } : { type: "emphasis", children };
  return { nodes: [node], next: close + token.length };
}

/** 配对标记（== ~~ ~ ^），流式未闭合返回 null。 */
export function parseWrapped(
  s: string,
  i: number,
  open: string,
  close: string,
  type: "mark" | "strike" | "sub" | "sup",
  options: ParseOptions,
  parseNested: InlineParser,
): { node: InlineNode; next: number } | null {
  if (!s.startsWith(open, i)) return null;
  const end = s.indexOf(close, i + open.length);
  if (end < 0) return null;
  const inner = s.slice(i + open.length, end);
  if (!inner && (type === "sub" || type === "sup")) return null;
  if (!inner && type !== "strike" && type !== "mark") return null;
  // strike/mark 允许空内容时仍跳过空
  if (!inner) return null;
  const children = parseNested(inner, options);
  return { node: { type, children }, next: end + close.length };
}
