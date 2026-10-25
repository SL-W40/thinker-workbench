/**
 * 排队等待文案：出队或终态时从时间线去掉，并在真正开始跑时把槽标成 busy。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyQueuedSlotEvent,
  QUEUED_WAIT_STEP_ID,
  stripQueuedWait,
  withQueuedWait,
} from "../../../src/features/chat/timeline";

describe("queued wait timeline", () => {
  it("用名次覆盖旧的等待文案", () => {
    const next = withQueuedWait(
      [{ id: QUEUED_WAIT_STEP_ID, kind: "text", text: "Waiting in queue · 2" }],
      "Waiting in queue · 1",
    );
    assert.equal(next.length, 1);
    assert.equal(next[0]?.id, QUEUED_WAIT_STEP_ID);
    assert.equal(next[0]?.kind, "text");
    if (next[0]?.kind !== "text") return;
    assert.equal(next[0].text, "Waiting in queue · 1");
  });

  it("没有等待步时原样返回", () => {
    const steps = [{ id: "reply", kind: "text" as const, text: "hello" }];
    assert.equal(stripQueuedWait(steps), steps);
  });

  it("终态去掉等待文案且保持不忙", () => {
    const slot = {
      busy: false,
      timeline: withQueuedWait([], "Waiting in queue · 1"),
    };
    applyQueuedSlotEvent(slot, "error");
    assert.equal(slot.busy, false);
    assert.equal(slot.timeline.length, 0);
  });

  it("首个产出事件去掉等待文案并标成 busy", () => {
    const slot = {
      busy: false,
      timeline: withQueuedWait([], "Waiting in queue · 1"),
    };
    applyQueuedSlotEvent(slot, "model_health");
    assert.equal(slot.busy, false);
    assert.equal(slot.timeline.length, 1);
    applyQueuedSlotEvent(slot, "status");
    assert.equal(slot.busy, true);
    assert.equal(slot.timeline.length, 0);
  });
});
