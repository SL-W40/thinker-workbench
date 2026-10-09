/**
 * 粗估 token 数（chars/4），与 Context Usage UI「约」一致。
 * 非精确 tokenizer，仅供占用展示与分段对齐。
 */

/** 按字符粗估 token；空串为 0。 */
export function estimateTokens(text: string): number {
  const n = text.length;
  if (n <= 0) return 0;
  return Math.ceil(n / 4);
}
