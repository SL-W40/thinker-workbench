/**
 * LiveRunRegistry：封存 / 前台切换基本行为。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  listBusyLiveRuns,
  parkForegroundRun,
  setForegroundSessionId,
  takeLiveRunSlot,
} from "../../src/features/chat/liveRunRegistry";

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
});
