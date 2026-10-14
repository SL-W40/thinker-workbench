/**
 * 助手可见正文与旧 System 气泡收成错误时间线。
 */
import assert from "node:assert/strict";
import type { ChatMessage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  normalizeChatMessage,
  toAgentHistory,
  visibleAssistantText,
} from "../../../src/features/chat/messageModel";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role">): ChatMessage {
  return { text: "", createdAt: 1, ...partial };
}

describe("message model", () => {
  it("正文为空时拼时间线里的 text 步；pending 和空用户消息不进历史", () => {
    const assistant = msg({
      id: "a",
      role: "assistant",
      text: "  ",
      timeline: [
        { id: "t1", kind: "text", text: "第一段" },
        { id: "t2", kind: "text", text: "第二段" },
      ],
    });
    assert.equal(visibleAssistantText(assistant), "第一段\n\n第二段");
    assert.equal(visibleAssistantText(msg({ id: "b", role: "assistant", text: "直接" })), "直接");

    const history = toAgentHistory([
      msg({ id: "u1", role: "user", text: "  " }),
      msg({ id: "u2", role: "user", text: "hi", pending: true }),
      msg({ id: "s", role: "system", text: "old" }),
      assistant,
    ]);
    assert.deepEqual(history, [{ role: "assistant", content: "第一段\n\n第二段" }]);
  });

  it("旧 system 气泡变成助手错误步，已有错误步则不重复加", () => {
    const converted = normalizeChatMessage(
      msg({ id: "s", role: "system", text: "Run cancelled." }),
    );
    assert.equal(converted.role, "assistant");
    assert.equal(converted.text, "");
    assert.equal(converted.timeline?.[0]?.kind, "error");
    if (converted.timeline?.[0]?.kind === "error") {
      assert.equal(converted.timeline[0].code, "CANCELLED");
    }

    const kept = normalizeChatMessage(
      msg({
        id: "s2",
        role: "system",
        text: "again",
        timeline: [{ id: "e", kind: "error", message: "already" }],
      }),
    );
    assert.equal(kept.timeline?.length, 1);
    assert.equal(normalizeChatMessage(msg({ id: "u", role: "user", text: "x" })).role, "user");
  });
});
