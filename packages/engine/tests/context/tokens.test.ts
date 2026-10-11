/**
 * token 估算冒烟：BPE 应明显优于纯 chars/4（中文）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { estimateTokens, estimateTokensFallback } from "../../src/context/tokens";

describe("estimateTokens", () => {
  it("counts English near ~4 chars/token", () => {
    const text = "hello world, this is a short english sentence";
    const n = estimateTokens(text);
    assert.ok(n >= 6 && n <= 16, `got ${n}`);
  });

  it("counts Chinese higher than chars/4", () => {
    const text = "你好世界，这是一段中文测试用于估算";
    const bpe = estimateTokens(text);
    const chars4 = Math.ceil(text.length / 4);
    assert.ok(bpe > chars4, `bpe ${bpe} should exceed chars/4 ${chars4}`);
  });

  it("fallback stays positive for mixed text", () => {
    assert.ok(estimateTokensFallback("hi 你好") >= 1);
    assert.equal(estimateTokensFallback(""), 0);
  });
});
