/**
 * 粗判 mermaid 源是否值得尝试渲染（流式未闭合时避免无次抛错）。
 */

/** 图表头关键字：不是这些开头的源一律不尝试渲染。 */
const HEADER_RE =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/i;

/** 去空行、去行尾空白后的有效行（流式裁剪与可渲染判定共用）。 */
export function meaningfulLines(source: string): string[] {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function looksRenderable(source: string): boolean {
  const t = source.trim();
  if (t.length < 12) return false;
  const lines = meaningfulLines(t);
  if (lines.length < 2) return false;
  const first = lines[0];
  if (!first) return false;
  return HEADER_RE.test(first);
}
