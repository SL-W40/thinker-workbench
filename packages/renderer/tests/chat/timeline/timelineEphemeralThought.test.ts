/**
 * 无 reasoning 正文的已结束 Thought 应被丢掉，避免「Thought Xs」空壳。
 * planning 不入库；有正文前 UI 显示 Planning next moves，而非 Thinking。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { applyStatus, applyToolEvent } from "../../../src/features/chat/timeline";

describe("ephemeral empty thought", () => {
  it("planning 状态不入库（由 UI 临时显示规划下一步）", () => {
    const next = applyStatus([], "planning");
    assert.equal(next.length, 0);
  });

  it("工具 start 时丢掉中间无正文的 Thought", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "t1",
        kind: "status",
        status: "thinking",
        active: true,
        startedAt: Date.now() - 3500,
      },
    ];
    const next = applyToolEvent(steps, {
      type: "tool",
      phase: "start",
      name: "browser_fill",
      callId: "c1",
      threadId: "th",
      runId: "r",
      ts: Date.now(),
    });
    assert.equal(
      next.some((s) => s.kind === "status" && s.status === "thinking"),
      false,
    );
    assert.equal(
      next.some((s) => s.kind === "tool" && s.name === "browser_fill"),
      true,
    );
  });

  it("有正文的 Thought 在工具 start 后仍保留", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "t1",
        kind: "status",
        status: "thinking",
        active: true,
        text: "先填表单",
        startedAt: Date.now() - 2000,
      },
    ];
    const next = applyToolEvent(steps, {
      type: "tool",
      phase: "start",
      name: "browser_click",
      callId: "c2",
      threadId: "th",
      runId: "r",
      ts: Date.now(),
    });
    const thought = next.find((s) => s.kind === "status" && s.status === "thinking");
    assert.ok(thought && thought.kind === "status");
    assert.equal(thought.active, false);
    assert.equal(thought.text, "先填表单");
  });
});
