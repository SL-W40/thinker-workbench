/**
 * 模式切换请求：挂在 request_mode_switch 卡上、答复后转只读、不进 Modal。
 */
import assert from "node:assert/strict";
import type { AgentEvent, ChatTimelineStep, HitlRequest } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  applyHitlRequest,
  applyHitlResolved,
  applyToolEvent,
  isTimelineHitlKind,
} from "../../../src/features/chat/timeline";

function request(overrides: Partial<HitlRequest> = {}): HitlRequest {
  return {
    hitlId: "hitl_mode",
    threadId: "th1",
    runId: "r1",
    kind: "mode_switch",
    title: "Switch to agent mode?",
    body: "要跑 shell 验证",
    payload: {
      targetMode: "agent",
      currentMode: "plan",
      sessionId: "s1",
      reason: "要跑 shell 验证",
    },
    actions: [
      { id: "switch", label: "Switch to agent", style: "primary" },
      { id: "stay", label: "Stay in plan", style: "ghost" },
    ],
    ...overrides,
  };
}

function runningStep(overrides: Partial<ChatTimelineStep> = {}): ChatTimelineStep {
  return {
    id: "tl1",
    kind: "tool",
    name: "request_mode_switch",
    phase: "start",
    active: true,
    ...overrides,
  } as ChatTimelineStep;
}

describe("mode_switch 时间线", () => {
  it("算时间线卡片类 HITL，不进 Modal", () => {
    assert.equal(isTimelineHitlKind("mode_switch"), true);
  });

  it("挂到正在跑的 request_mode_switch 卡上，不新增行", () => {
    const next = applyHitlRequest([runningStep()], request());
    assert.equal(next.length, 1);
    const step = next[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.deepEqual(step.modeSwitch, {
      hitlId: "hitl_mode",
      targetMode: "agent",
      currentMode: "plan",
      reason: "要跑 shell 验证",
    });
    assert.equal(step.hitl?.actions.length, 2);
  });

  it("没有对应工具行时自建一行，保证卡片出现在时间线", () => {
    const next = applyHitlRequest([], request());
    assert.equal(next.length, 1);
    const step = next[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.name, "request_mode_switch");
    assert.equal(step.modeSwitch?.targetMode, "agent");
  });

  it("用户选切换后：记下选择、清掉按钮、行结束", () => {
    const attached = applyHitlRequest([runningStep()], request());
    const resolved = applyHitlResolved(attached, "hitl_mode", "switch");
    const step = resolved[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.modeSwitch?.resolvedAction, "switch");
    assert.equal(step.hitl, undefined);
    assert.equal(step.active, false);
  });

  it("用户选保持同样落定（不切换）", () => {
    const attached = applyHitlRequest([runningStep()], request());
    const resolved = applyHitlResolved(attached, "hitl_mode", "stay");
    const step = resolved[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.modeSwitch?.resolvedAction, "stay");
  });

  // HITL 请求走独立通道，可能先于 tool start 落地；迟到的 start/end 必须认领回原卡
  it("HITL 先到、tool start 后到：并回同一张卡，不新增空行", () => {
    const card = applyHitlRequest([], request());
    const started = applyToolEvent(card, {
      type: "tool",
      phase: "start",
      name: "request_mode_switch",
      callId: "call_1",
    } as Extract<AgentEvent, { type: "tool" }>);
    assert.equal(started.length, 1);
    const step = started[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.callId, "call_1");
    assert.equal(step.modeSwitch?.targetMode, "agent");
    assert.equal(step.hitl?.actions.length, 2);
  });

  it("tool end 后到：按 callId 收束同一张卡", () => {
    const card = applyHitlRequest([], request());
    const started = applyToolEvent(card, {
      type: "tool",
      phase: "start",
      name: "request_mode_switch",
      callId: "call_1",
    } as Extract<AgentEvent, { type: "tool" }>);
    const ended = applyToolEvent(started, {
      type: "tool",
      phase: "end",
      name: "request_mode_switch",
      callId: "call_1",
      ok: true,
    } as Extract<AgentEvent, { type: "tool" }>);
    assert.equal(ended.length, 1);
    const step = ended[0];
    if (step?.kind !== "tool") assert.fail("expected tool step");
    assert.equal(step.modeSwitch?.targetMode, "agent");
    assert.equal(step.active, false);
  });
});
