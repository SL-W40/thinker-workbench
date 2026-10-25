/**
 * todo 工具的结构化提示应随工具事件进时间线：start 带上、end 沿用、不被 undefined 抹掉。
 */
import assert from "node:assert/strict";
import type { AgentEvent } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { applyToolEvent } from "../../../src/features/chat/timeline";

function toolEvent(overrides: Partial<Extract<AgentEvent, { type: "tool" }>> = {}) {
  return {
    type: "tool" as const,
    phase: "start" as const,
    name: "todo",
    callId: "call_1",
    threadId: "th1",
    runId: "run1",
    ts: 0,
    ...overrides,
  };
}

const HINT = { action: "complete" as const, count: 2, labels: ["搭骨架", "跑起来"] };

describe("applyToolEvent todo hint", () => {
  it("start 带上动作与受影响条目", () => {
    const next = applyToolEvent([], toolEvent({ todo: HINT }));
    const step = next[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.deepEqual(step.todo, HINT);
  });

  it("end 沿用 start 的提示", () => {
    const started = applyToolEvent([], toolEvent({ todo: HINT }));
    const ended = applyToolEvent(
      started,
      toolEvent({ phase: "end", ok: true, detail: "ok", ts: 10 }),
    );
    const step = ended[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.phase, "end");
    // end 不带 todo 时不能被 undefined 覆盖
    assert.deepEqual(step.todo, HINT);
  });

  it("只收到 end 时也保留提示", () => {
    const next = applyToolEvent([], toolEvent({ phase: "end", ok: true, todo: HINT }));
    const step = next[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.deepEqual(step.todo, HINT);
  });
});
