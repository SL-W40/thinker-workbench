/**
 * 上下文估算调度纯函数：指纹稳定性、是否发起、防抖时长、请求体。
 */
import assert from "node:assert/strict";
import type { ChatMessage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { createMessage } from "../../../src/features/chat/message/messageModel";
import {
  buildUsageSignature,
  shouldRequestUsage,
  toUsageMessages,
  usageDebounceMs,
} from "../../../src/features/chat/usage/usageSchedule";

/** 造一条消息；pending 助手用于验证流式正文参与估算。 */
function msg(role: "user" | "assistant", text: string, pending = false): ChatMessage {
  return createMessage(role, text, pending);
}

describe("buildUsageSignature", () => {
  it("内容相同、数组引用不同 → 指纹相同（不因重渲染重算）", () => {
    const a = [msg("user", "hi"), msg("assistant", "hello")];
    const b = [msg("user", "hi"), msg("assistant", "hello")];
    assert.equal(
      buildUsageSignature({ messages: a, draft: "" }),
      buildUsageSignature({ messages: b, draft: "" }),
    );
  });

  it("正文 / 条数 / pending / 草稿 / 工作区 / 刷新计数任一变化都会改指纹", () => {
    const base = { messages: [msg("user", "hi")], draft: "", workspaceRoot: "/ws" };
    const sigBase = buildUsageSignature(base);
    assert.notEqual(sigBase, buildUsageSignature({ ...base, draft: "新输入" }));
    assert.notEqual(
      sigBase,
      buildUsageSignature({ ...base, messages: [msg("user", "hi"), msg("user", "second")] }),
    );
    assert.notEqual(
      sigBase,
      buildUsageSignature({ ...base, messages: [msg("user", "hi"), msg("assistant", "x", true)] }),
    );
    assert.notEqual(sigBase, buildUsageSignature({ ...base, workspaceRoot: "/other" }));
    assert.notEqual(sigBase, buildUsageSignature({ ...base, refreshToken: 1 }));
  });

  it("流式正文增长会改指纹（末条长度参与）", () => {
    const short = buildUsageSignature({ messages: [msg("assistant", "正在写", true)], draft: "" });
    const long = buildUsageSignature({
      messages: [msg("assistant", "正在写一整段回复", true)],
      draft: "",
    });
    assert.notEqual(short, long);
  });
});

describe("shouldRequestUsage", () => {
  it("打开态一律重算（面板可见要灵敏跟随）", () => {
    assert.equal(shouldRequestUsage(true, "sig", "sig"), true);
    assert.equal(shouldRequestUsage(true, "sig", null), true);
  });

  it("关闭态只在指纹变化时重算", () => {
    assert.equal(shouldRequestUsage(false, "sig", "sig"), false);
    assert.equal(shouldRequestUsage(false, "sig2", "sig"), true);
    assert.equal(shouldRequestUsage(false, "sig", null), true);
  });
});

describe("usageDebounceMs", () => {
  it("打开 80ms、关闭 1000ms", () => {
    assert.equal(usageDebounceMs(true), 80);
    assert.equal(usageDebounceMs(false), 1000);
  });
});

describe("toUsageMessages", () => {
  it("流式中的 pending 助手正文计入估算", () => {
    const out = toUsageMessages([msg("user", "问题"), msg("assistant", "部分回答", true)], "");
    assert.deepEqual(out, [
      { role: "user", content: "问题" },
      { role: "assistant", content: "部分回答" },
    ]);
  });

  it("空正文跳过，草稿作为最后一条 user 追加", () => {
    const out = toUsageMessages([msg("user", "  "), msg("assistant", "")], "  草稿  ");
    assert.deepEqual(out, [{ role: "user", content: "草稿" }]);
  });

  it("超长会话只保留最近若干条", () => {
    const many: ChatMessage[] = [];
    for (let i = 0; i < 260; i += 1) many.push(msg("user", `m${i}`));
    const out = toUsageMessages(many, "");
    assert.equal(out.length, 200);
    assert.equal(out.at(-1)?.content, "m259");
  });
});
