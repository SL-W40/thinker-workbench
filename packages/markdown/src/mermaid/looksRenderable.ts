/**
 * 粗判 mermaid 源是否值得尝试渲染（流式未闭合时避免无次抛错）。
 */
export function looksRenderable(source: string): boolean {
  const t = source.trim();
  if (t.length < 12) return false;
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/i.test(
    lines[0]!,
  );
}
