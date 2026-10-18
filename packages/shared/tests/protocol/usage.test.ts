/**
 * 用量数学：engine / renderer / desktop 共用的唯一实现。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  addUsage,
  EMPTY_USAGE,
  hasUsage,
  sanitizeUsage,
  totalTokens,
} from "../../src/protocol/usage";

const full = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 30,
  cacheWriteTokens: 5,
  reasoningTokens: 8,
};

describe("sanitizeUsage", () => {
  it("合法值原样保留", () => {
    assert.deepEqual(sanitizeUsage(full), full);
  });

  it("NaN / 负数 / 小数 / 缺失字段归一为 0", () => {
    assert.deepEqual(
      sanitizeUsage({
        inputTokens: Number.NaN,
        outputTokens: -5,
        cacheReadTokens: 1.7,
        cacheWriteTokens: 2,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1,
        cacheWriteTokens: 2,
        reasoningTokens: 0,
      },
    );
  });

  it("非对象 / 空值返回 undefined（保留「未知」，不补 0）", () => {
    assert.equal(sanitizeUsage(null), undefined);
    assert.equal(sanitizeUsage(undefined), undefined);
    assert.equal(sanitizeUsage("nope"), undefined);
    assert.equal(sanitizeUsage([1, 2]), undefined);
    assert.equal(sanitizeUsage({}), undefined);
  });
});

describe("addUsage / totalTokens / hasUsage", () => {
  it("逐字段相加", () => {
    assert.deepEqual(addUsage(EMPTY_USAGE, full), full);
    assert.deepEqual(addUsage(full, full), {
      inputTokens: 200,
      outputTokens: 40,
      cacheReadTokens: 60,
      cacheWriteTokens: 10,
      reasoningTokens: 16,
    });
  });

  it("总计与「是否有用量」", () => {
    assert.equal(totalTokens(full), 120);
    assert.equal(hasUsage(full), true);
    assert.equal(hasUsage(EMPTY_USAGE), false);
    assert.equal(hasUsage(undefined), false);
  });
});
