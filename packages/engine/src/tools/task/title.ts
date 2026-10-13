/**
 * Task 展示标题：优先显式 title，其次 prompt 首行。
 */

const DEFAULT_MAX = 56;

/**
 * 从 Task title / prompt 推导 UI 短标题。
 * 供流式预告、tools 节点 span 与正式 started 共用。
 */
export function deriveTaskTitle(
  titleArg?: string | null,
  prompt?: string | null,
  max = DEFAULT_MAX,
): string | undefined {
  const explicit = typeof titleArg === "string" ? titleArg.trim() : "";
  const raw =
    explicit || (typeof prompt === "string" ? prompt.trim().split(/\r?\n/)[0]?.trim() || "" : "");
  if (!raw) return undefined;
  const one = raw.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(1, max - 1))}…`;
}
