/**
 * 轻量 token 估算（渲染进程用；无 BPE 表）。
 *
 * Context Usage 主路径走 engine 的 gpt-tokenizer；
 * 此处供中断/未回 usage 时的会话条粗估，规则与 engine fallback 对齐。
 */

/** 混合语料估算：CJK ≈ 1.7 字/token，其余 ≈ 4 字/token。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xff00 && cp <= 0xffef)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.max(1, Math.ceil(cjk / 1.7 + other / 4));
}
