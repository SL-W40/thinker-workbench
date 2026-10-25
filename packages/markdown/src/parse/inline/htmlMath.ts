/**
 * 行内 HTML（白名单）与数学公式 `$...$` / `$$...$$`。
 * HTML 的内容递归解析由 `parseNested` 注入。
 */
import type { InlineNode } from "../../types";
import type { ParseOptions } from "../options";
import type { InlineParser } from "./emphasis";

/** 白名单行内 HTML。 */
export function parseHtmlInline(
  s: string,
  i: number,
  options: ParseOptions,
  parseNested: InlineParser,
): { node: InlineNode; next: number } | null {
  if (s[i] !== "<") return null;

  const br = /^<br\s*\/?>/i.exec(s.slice(i));
  if (br) {
    return { node: { type: "break" }, next: i + br[0].length };
  }

  const paired = /^<(u|mark|sub|sup|kbd)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/i.exec(s.slice(i));
  if (!paired) return null;
  const tag = paired[1].toLowerCase();
  const inner = paired[3];
  const next = i + paired[0].length;
  if (tag === "kbd") {
    return { node: { type: "kbd", value: inner }, next };
  }
  if (tag === "u") {
    return { node: { type: "underline", children: parseNested(inner, options) }, next };
  }
  if (tag === "mark") {
    return { node: { type: "mark", children: parseNested(inner, options) }, next };
  }
  if (tag === "sub") {
    return { node: { type: "sub", children: parseNested(inner, options) }, next };
  }
  if (tag === "sup") {
    return { node: { type: "sup", children: parseNested(inner, options) }, next };
  }
  return null;
}

/** 行内 $...$ / $$...$$；流式未闭合返回 null（调用方当文本）。 */
export function parseMathInline(
  s: string,
  i: number,
  streaming: boolean,
): { node: InlineNode; next: number } | null {
  if (s[i] !== "$") return null;

  // 块式 $$ 在块级处理；行内若出现 $$...$$ 也支持
  if (s.startsWith("$$", i)) {
    const end = s.indexOf("$$", i + 2);
    if (end < 0) return streaming ? null : null;
    const value = s.slice(i + 2, end);
    if (!value.trim()) return null;
    return { node: { type: "math", value }, next: end + 2 };
  }

  // 货币启发：`$5` 后非空白且无闭合 → 不当数学
  const after = s[i + 1];
  if (!after || after === " " || after === "\t" || after === "\n") return null;

  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\" && j + 1 < s.length) {
      j += 2;
      continue;
    }
    if (s[j] === "$") break;
    if (s[j] === "\n") return null;
    j += 1;
  }
  if (j >= s.length || s[j] !== "$") return streaming ? null : null;
  const value = s.slice(i + 1, j);
  if (!value.trim()) return null;
  // 闭合 $ 前一字符不能是空白（避免 `$ x $` 误判仍允许；货币 `$5` 已在上面挡开）
  const beforeClose = s[j - 1];
  if (beforeClose === " " || beforeClose === "\t") return null;
  return { node: { type: "math", value }, next: j + 1 };
}
