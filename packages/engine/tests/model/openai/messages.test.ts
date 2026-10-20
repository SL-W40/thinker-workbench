/**
 * openai messages 归一化纯函数（engine/src/model/openai/messages.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { asNonNegInt, extractReasoningPiece, parseUsage } from "../../../src/model/openai/messages";

describe("asNonNegInt", () => {
  it("accepts finite non-negative numbers and numeric strings", () => {
    assert.equal(asNonNegInt(0), 0);
    assert.equal(asNonNegInt(12.7), 12);
    assert.equal(asNonNegInt("42"), 42);
  });

  it("rejects negatives, NaN, Infinity and junk", () => {
    assert.equal(asNonNegInt(-1), undefined);
    assert.equal(asNonNegInt(Number.NaN), undefined);
    assert.equal(asNonNegInt(Number.POSITIVE_INFINITY), undefined);
    assert.equal(asNonNegInt("abc"), undefined);
    assert.equal(asNonNegInt("  "), undefined);
    assert.equal(asNonNegInt(null), undefined);
  });
});

describe("extractReasoningPiece", () => {
  it("reads known reasoning keys in order", () => {
    assert.equal(extractReasoningPiece({ reasoning_content: "a" }), "a");
    assert.equal(extractReasoningPiece({ reasoning: "b" }), "b");
    assert.equal(extractReasoningPiece({ thinking: "c" }), "c");
    // 优先级：靠前的键胜出
    assert.equal(extractReasoningPiece({ thinking: "c", reasoning: "b" }), "b");
    assert.equal(extractReasoningPiece(undefined), "");
    assert.equal(extractReasoningPiece({}), "");
    assert.equal(extractReasoningPiece({ reasoning: 1 }), "");
  });
});

describe("parseUsage", () => {
  it("returns undefined for non-objects and all-zero usage", () => {
    assert.equal(parseUsage(null), undefined);
    assert.equal(parseUsage("x"), undefined);
    assert.equal(parseUsage({ prompt_tokens: 0, completion_tokens: 0 }), undefined);
  });

  it("maps OpenAI token fields", () => {
    assert.deepEqual(parseUsage({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }), {
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    });
  });

  it("falls back to input/output_tokens aliases and reads cache details", () => {
    const usage = parseUsage({
      input_tokens: "8",
      output_tokens: 2,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 5,
      completion_tokens_details: { reasoning_tokens: 1 },
    });
    assert.deepEqual(usage, {
      inputTokens: 8,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 5,
      reasoningTokens: 1,
    });
  });

  it("keeps usage when only total is present", () => {
    assert.notEqual(parseUsage({ total_tokens: 9 }), undefined);
  });
});
