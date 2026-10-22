/**
 * 思考摘要默认截断，避免过程预览拉成上百字。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { summarizeThinking } from "../../../src/features/chat/timelineModel";

describe("summarizeThinking", () => {
  it("短句原样返回", () => {
    assert.equal(summarizeThinking("找到点击刷新的原因。"), "找到点击刷新的原因。");
  });

  it("超长无句读时截到默认上限 48", () => {
    const summary = summarizeThinking("结".repeat(80));
    assert.equal(summary.length, 48);
    assert.ok(summary.endsWith("…"));
  });
});
