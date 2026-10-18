/**
 * LiveRunRegistry：封存 / 前台切换基本行为。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  accumulateSlotUsage,
  listBusyLiveRuns,
  parkForegroundRun,
  setForegroundSessionId,
  takeLiveRunSlot,
  terminalUsagePatch,
} from "../../src/features/chat/liveRunRegistry";
import { EMPTY_USAGE } from "../../src/features/chat/usageStats";

describe("liveRunRegistry", () => {
  it("park 后可按 session 取回 busy 槽", () => {
    setForegroundSessionId("session_fg");
    parkForegroundRun({
      sessionId: "session_bg",
      threadId: "thread_bg",
      runId: "run_1",
      messages: [],
      streamText: "hello",
      timeline: [],
      targetMsgId: "msg_1",
      busy: true,
    });
    const busy = listBusyLiveRuns();
    assert.ok(busy.some((s) => s.sessionId === "session_bg"));
    const slot = takeLiveRunSlot("session_bg");
    assert.equal(slot?.runId, "run_1");
    assert.equal(slot?.streamText, "hello");
    assert.equal(slot?.busy, true);
  });

  it("后台 / 切走会话的 usage 会累计（以前被整条丢弃）", () => {
    parkForegroundRun({
      sessionId: "session_usage",
      threadId: "thread_usage",
      runId: "run_usage",
      messages: [],
      streamText: "",
      timeline: [],
      targetMsgId: "msg_usage",
      busy: true,
    });
    const slot = takeLiveRunSlot("session_usage");
    assert.ok(slot);
    accumulateSlotUsage(slot, { ...EMPTY_USAGE, inputTokens: 100, outputTokens: 20 });
    accumulateSlotUsage(slot, { ...EMPTY_USAGE, inputTokens: 50, outputTokens: 5 });
    assert.equal(slot.usage?.inputTokens, 150);
    assert.equal(slot.usage?.outputTokens, 25);
  });

  it("终态用量以引擎值为准，没给则退回槽内存量，都没有保持未知", () => {
    const slot = {
      sessionId: "s",
      threadId: "t",
      runId: "r",
      messages: [],
      streamText: "",
      timeline: [],
      targetMsgId: "m",
      busy: false,
      stopping: false,
      modalHitl: null,
      canResume: false as const,
      usage: undefined,
    };
    // 引擎没给、槽里也没有 → 空补丁（UI 展示「—」，不补 0）
    assert.deepEqual(terminalUsagePatch(slot, {}), {});
    // 引擎没给、槽里有 → 用槽内存量
    accumulateSlotUsage(slot, { ...EMPTY_USAGE, inputTokens: 10 });
    assert.deepEqual(terminalUsagePatch(slot, {}), {
      usage: { ...EMPTY_USAGE, inputTokens: 10 },
    });
    // 引擎给了 → 覆盖槽内存量，并带估算标记
    const engineUsage = { ...EMPTY_USAGE, inputTokens: 999, outputTokens: 1 };
    assert.deepEqual(terminalUsagePatch(slot, { usage: engineUsage, usageEstimated: true }), {
      usage: engineUsage,
      usageEstimated: true,
    });
  });
});
