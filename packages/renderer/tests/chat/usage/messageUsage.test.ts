/**
 * 终态用量：以引擎下发值为准，缺省保持未知（不补 0、不粗估）。
 */
import assert from "node:assert/strict";
import type { ChatMessage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { finishMessageUsage } from "../../../src/features/chat/usage/messageUsage";

const OFFICIAL = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

function assistant(patch: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "a1", role: "assistant", text: "hi", ...patch };
}

describe("finishMessageUsage", () => {
  it("引擎给了值就以之为准（替换直播累加值）", () => {
    const next = finishMessageUsage(
      assistant({ usage: { ...OFFICIAL, inputTokens: 1 } }),
      OFFICIAL,
    );
    assert.deepEqual(next.usage, OFFICIAL);
    assert.equal(next.usageEstimated, false);
  });

  it("含粗估时带上 estimated 标记", () => {
    const next = finishMessageUsage(assistant(), OFFICIAL, true);
    assert.deepEqual(next.usage, OFFICIAL);
    assert.equal(next.usageEstimated, true);
  });

  it("引擎没给（本 run 无模型调用）→ 保持原样，绝不补 0", () => {
    const base = assistant();
    assert.equal(finishMessageUsage(base, undefined), base);
    const withLive = assistant({ usage: { ...OFFICIAL, inputTokens: 7 } });
    assert.equal(finishMessageUsage(withLive, undefined).usage?.inputTokens, 7);
  });
});
