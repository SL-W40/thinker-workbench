/**
 * create_plan 参数流式：`plan/drafting` 先挂卡片，后续 tool start/end 复用同一张。
 */
import assert from "node:assert/strict";
import type { AgentEvent, ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { applyPlanDraftStep, applyToolEvent } from "../../../src/features/chat/timeline";

const base = { threadId: "th1", runId: "run1", ts: 0 };

function draft(overrides: Partial<Extract<AgentEvent, { type: "plan" }>> = {}) {
  return {
    ...base,
    type: "plan" as const,
    phase: "drafting" as const,
    planId: "plan-s1",
    callId: "call_1",
    status: "ready" as const,
    todos: [],
    ...overrides,
  };
}

function toolStart(callId?: string): Extract<AgentEvent, { type: "tool" }> {
  return {
    ...base,
    type: "tool",
    phase: "start",
    name: "create_plan",
    ...(callId ? { callId } : {}),
  };
}

function toolEnd(callId: string): Extract<AgentEvent, { type: "tool" }> {
  return { ...base, type: "tool", phase: "end", name: "create_plan", callId, ok: true };
}

describe("applyPlanDraftStep", () => {
  it("首次草稿新建一张 create_plan 卡", () => {
    const next = applyPlanDraftStep([], draft());
    assert.equal(next.length, 1);
    const s = next[0];
    assert.ok(s?.kind === "tool");
    assert.equal(s?.name, "create_plan");
    assert.equal(s?.callId, "call_1");
    assert.equal(s?.active, true);
  });

  it("后续草稿复用同一张卡，不开第二张", () => {
    const first = applyPlanDraftStep([], draft());
    const second = applyPlanDraftStep(first, draft({ title: "飞机大战" }));
    assert.equal(second.length, 1);
    assert.equal(second[0]?.id, first[0]?.id);
  });

  it("缺 callId 时按同名兜底复用（首包 id 迟到场景）", () => {
    const steps: ChatTimelineStep[] = [
      { id: "tl1", kind: "tool", name: "create_plan", phase: "start", active: true },
    ];
    const next = applyPlanDraftStep(steps, draft({ callId: undefined }));
    assert.equal(next.length, 1);
    assert.equal(next[0]?.id, "tl1");
  });

  it("真正的 tool start 合并进草稿卡，end 后收束", () => {
    let steps = applyPlanDraftStep([], draft({ title: "飞机大战" }));
    steps = applyToolEvent(steps, toolStart("call_1"));
    assert.equal(steps.length, 1);
    steps = applyToolEvent(steps, toolEnd("call_1"));
    assert.equal(steps.length, 1);
    const s = steps[0];
    assert.ok(s?.kind === "tool");
    assert.equal(s?.phase, "end");
    assert.equal(s?.active, false);
  });

  it("草稿卡没有 callId 时，带 callId 的 tool start 也合并（不另开一张）", () => {
    let steps = applyPlanDraftStep([], draft({ callId: undefined }));
    steps = applyToolEvent(steps, toolStart("call_9"));
    assert.equal(steps.length, 1);
    const s = steps[0];
    assert.ok(s?.kind === "tool");
    assert.equal(s?.callId, "call_9");
  });
});
