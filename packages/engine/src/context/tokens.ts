/**
 * Token 估算：主路径用 gpt-tokenizer BPE；fallback 供无表场景。
 */
import { encode } from "gpt-tokenizer";

/** 按 OpenAI 兼容 BPE 估算 token；空串为 0。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

/** 无 BPE 时的混合语料粗估（与 shared estimateTokens 规则一致）。 */
export function estimateTokensFallback(text: string): number {
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
