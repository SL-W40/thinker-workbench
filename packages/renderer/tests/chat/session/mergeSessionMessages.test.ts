/**
 * 「本地 vs DB」合并的唯一真相：计数门禁、本地优先保计时 / 用量、timeline 择优、直播槽路径。
 */
import assert from "node:assert/strict";
import type { ChatMessage, ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { mergeSessionMessages } from "../../../src/features/chat/session/mergeSessionMessages";

function msg(patch: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m1", role: "assistant", text: "hi", ...patch };
}

/** 完整五字段用量（ModelUsage 不允许部分字段）。 */
const USAGE = {
  inputTokens: 5,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

function toolStep(id: string, patch: Partial<Extract<ChatTimelineStep, { kind: "tool" }>> = {}) {
  return {
    id,
    kind: "tool",
    name: "shell",
    phase: "start",
    active: true,
    ...patch,
  } as ChatTimelineStep;
}

describe("mergeSessionMessages 计数门禁", () => {
  it("本地非空而 DB 空：保留本地（防抖未落库）", () => {
    const local = [msg({ id: "a1", text: "刚发出" })];
    assert.deepEqual(mergeSessionMessages([], local, { hasLiveTarget: false }), local);
  });

  it("双边都空：仍是空", () => {
    assert.deepEqual(mergeSessionMessages([], [], { hasLiveTarget: false }), []);
  });

  it("本地空而 DB 有：用 DB", () => {
    const db = [msg({ id: "a1" })];
    assert.deepEqual(mergeSessionMessages(db, [], { hasLiveTarget: false }), db);
  });
});

describe("mergeSessionMessages 重载路径", () => {
  it("本地优先保 durationMs / usage：DB 旧快照不得覆盖刚结算的值", () => {
    const db = [msg({ id: "a1", text: "旧", durationMs: undefined, usage: undefined })];
    const local = [msg({ id: "a1", text: "新", durationMs: 1234, usage: { ...USAGE } })];
    const [merged] = mergeSessionMessages(db, local, { hasLiveTarget: false });
    assert.equal(merged.durationMs, 1234);
    assert.deepEqual(merged.usage, USAGE);
    // 未知保持未知：DB 也没有 usageEstimated 时不得补 false
    assert.equal(merged.usageEstimated, undefined);
  });

  it("DB 独有字段（本地缺失）时以 DB 为准", () => {
    const db = [msg({ id: "a1", traceId: "trace_db" })];
    const local = [msg({ id: "a1" })];
    const [merged] = mergeSessionMessages(db, local, { hasLiveTarget: false });
    assert.equal(merged.traceId, "trace_db");
  });

  it("非助手消息以 DB 为准（用户气泡不可变）", () => {
    const db = [{ id: "u1", role: "user", text: "db 版" } as ChatMessage];
    const local = [{ id: "u1", role: "user", text: "local 版" } as ChatMessage];
    const [merged] = mergeSessionMessages(db, local, { hasLiveTarget: false });
    assert.equal(merged.text, "db 版");
  });

  it("本地没有对应消息时整条用 DB", () => {
    const db = [msg({ id: "a1", text: "only db" })];
    const [merged] = mergeSessionMessages(db, [], { hasLiveTarget: false });
    assert.equal(merged.text, "only db");
  });

  it("正文取更长的一侧", () => {
    const db = [msg({ id: "a1", text: "短" })];
    const local = [msg({ id: "a1", text: "更长的正文" })];
    assert.equal(mergeSessionMessages(db, local, { hasLiveTarget: false })[0]?.text, "更长的正文");

    const db2 = [msg({ id: "a1", text: "更长的正文" })];
    const local2 = [msg({ id: "a1", text: "短" })];
    assert.equal(
      mergeSessionMessages(db2, local2, { hasLiveTarget: false })[0]?.text,
      "更长的正文",
    );
  });

  it("timeline 择优：工具行 + diff 更完整的一侧获胜", () => {
    const rich: ChatTimelineStep[] = [
      toolStep("t1", { diff: "@@ -1 +1 @@", phase: "end" }),
      toolStep("t2"),
    ];
    const poor: ChatTimelineStep[] = [toolStep("t1")];
    const db = [msg({ id: "a1", timeline: poor })];
    const local = [msg({ id: "a1", timeline: rich })];
    const [merged] = mergeSessionMessages(db, local, { hasLiveTarget: false });
    assert.equal(merged.timeline?.length, 2);
    assert.equal((merged.timeline?.[0] as { diff?: string } | undefined)?.diff, "@@ -1 +1 @@");

    // 反向：DB 更完整时也用 DB 的时间线
    const [flipped] = mergeSessionMessages(
      [msg({ id: "a1", timeline: rich })],
      [msg({ id: "a1", timeline: poor })],
      { hasLiveTarget: false },
    );
    assert.equal(flipped.timeline?.length, 2);
  });

  it("pending 需双边都为 true", () => {
    const db = [msg({ id: "a1", pending: true })];
    const local = [msg({ id: "a1", pending: false })];
    assert.equal(mergeSessionMessages(db, local, { hasLiveTarget: false })[0]?.pending, false);
  });
});

describe("mergeSessionMessages 直播路径", () => {
  it("本地槽不短于 DB：整序用本地，仅丰富直播目标", () => {
    const db = [msg({ id: "a0", text: "旧助手" }), msg({ id: "a1", text: "db 目标" })];
    const local = [
      msg({ id: "a0", text: "旧助手" }),
      msg({ id: "a1", text: "半截流式", usage: undefined }),
    ];
    const merged = mergeSessionMessages(db, local, {
      hasLiveTarget: true,
      live: { targetMsgId: "a1", streamText: "完整流式正文", timeline: [toolStep("t1")] },
    });
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.id, "a0");
    const target = merged[1];
    assert.equal(target?.id, "a1");
    assert.equal(target?.text, "完整流式正文");
    assert.equal(target?.pending, true);
    assert.equal(target?.timeline?.length, 1);
    // 非目标消息保持本地原值
    assert.equal(merged[0]?.text, "旧助手");
  });

  it("直播目标用量：槽里没有时用 DB 的，不许冲掉", () => {
    const usage = { ...USAGE, inputTokens: 9, outputTokens: 2 };
    const db = [msg({ id: "a1", text: "db 目标", usage })];
    const local = [msg({ id: "a1", text: "半截" })];
    const [target] = mergeSessionMessages(db, local, {
      hasLiveTarget: true,
      live: { targetMsgId: "a1", streamText: "", timeline: [] },
    });
    assert.deepEqual(target?.usage, usage);
  });

  it("DB 更完整：以 DB 为骨架，同 id 用本地值覆盖", () => {
    const db = [msg({ id: "a0", text: "db0" }), msg({ id: "a1", text: "db1" })];
    const local = [msg({ id: "a1", text: "local1" })];
    const merged = mergeSessionMessages(db, local, { hasLiveTarget: true });
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.text, "db0");
    assert.equal(merged[1]?.text, "local1");
  });

  it("直播路径也受计数门禁保护", () => {
    const local = [msg({ id: "a1" })];
    assert.deepEqual(mergeSessionMessages([], local, { hasLiveTarget: true }), local);
  });
});
