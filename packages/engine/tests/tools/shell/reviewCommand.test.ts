/**
 * 命令研判：无模型、无法解析、allow / ask，以及调用失败都回落到 ask。
 */
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

vi.mock("../../../src/model/openai", () => ({
  getChatModel: vi.fn(),
}));

import { getChatModel } from "../../../src/model/openai";
import { reviewCommand } from "../../../src/tools/shell/reviewCommand";

describe("reviewCommand", () => {
  it("模型未配置或回复不是 JSON 时要求确认", async () => {
    vi.mocked(getChatModel).mockImplementation(() => {
      throw new Error("MODEL_API_KEY_MISSING");
    });
    const missing = await reviewCommand("git status", new AbortController().signal);
    assert.deepEqual(missing, { decision: "ask", reason: "Model not configured." });

    vi.mocked(getChatModel).mockReturnValue({
      chat: async () => ({ content: "not json" }),
    } as never);
    const bad = await reviewCommand("git status", new AbortController().signal);
    assert.equal(bad.decision, "ask");
    assert.equal(bad.reason, "Unparseable review.");
  });

  it("从回复里抽出 JSON；allow 以外都算 ask；调用失败也 ask", async () => {
    vi.mocked(getChatModel).mockReturnValue({
      chat: async () => ({ content: 'note {"decision":"allow","reason":""}' }),
    } as never);
    const allowed = await reviewCommand("git status", new AbortController().signal);
    assert.deepEqual(allowed, { decision: "allow", reason: "Allowed by review." });

    vi.mocked(getChatModel).mockReturnValue({
      chat: async () => ({ content: '{"decision":"nope"}' }),
    } as never);
    const ask = await reviewCommand("rm -rf /", new AbortController().signal);
    assert.deepEqual(ask, { decision: "ask", reason: "Needs confirmation." });

    vi.mocked(getChatModel).mockReturnValue({
      chat: async () => {
        throw new Error("timeout");
      },
    } as never);
    const failed = await reviewCommand("ls", new AbortController().signal);
    assert.deepEqual(failed, { decision: "ask", reason: "Review failed." });
  });
});
