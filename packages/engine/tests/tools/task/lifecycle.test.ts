/**
 * 后台 Task：cancelOne 真 abort、TTL prune、resume 种子。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { isToolAllowedForChatMode, setChatMode } from "../../../src/chatMode";
import type { GraphState } from "../../../src/graph/types";
import {
  BACKGROUND_TASK_TTL_MS,
  cancelOneBackgroundTask,
  clearBackgroundTasksForTests,
  getBackgroundTaskForTests,
  pruneSettledBackgroundTasks,
  registerRunningBackgroundTaskForTests,
  seedFailedBackgroundTask,
  seedFailedOrphanTasksFromState,
} from "../../../src/tools/task/execute";

afterEach(() => {
  clearBackgroundTasksForTests();
  vi.useRealTimers();
});

describe("background Task lifecycle", () => {
  it("seedFailedBackgroundTask 后 task 为 failed 可供 await", () => {
    seedFailedBackgroundTask("t1", { subagent: "explorer", parentRunId: "run-1" });
    const snap = getBackgroundTaskForTests("t1");
    assert.ok(snap);
    assert.equal(snap.status, "failed");
    assert.equal(snap.parentRunId, "run-1");
    assert.match(snap.error ?? "", /Interrupted by process crash/);
  });

  it("seedFailedOrphanTasksFromState 只种已开工且无结果的 Task", () => {
    const state: GraphState = {
      message: "hi",
      messages: [],
      reply: "",
      pendingToolCalls: [
        {
          id: "call_task",
          type: "function",
          function: {
            name: "Task",
            arguments: JSON.stringify({ subagent: "coder", prompt: "do" }),
          },
        },
        {
          id: "call_shell",
          type: "function",
          function: { name: "shell", arguments: "{}" },
        },
      ],
      startedToolCallIds: ["call_task", "call_shell"],
      step: 1,
    };
    seedFailedOrphanTasksFromState(state, "run-x");
    assert.ok(getBackgroundTaskForTests("call_task"));
    assert.equal(getBackgroundTaskForTests("call_shell"), null);
  });

  it("TTL 过期后 prune 删除已收束条目", () => {
    vi.useFakeTimers();
    seedFailedBackgroundTask("old", { parentRunId: "r" });
    assert.ok(getBackgroundTaskForTests("old"));
    vi.advanceTimersByTime(BACKGROUND_TASK_TTL_MS + 1);
    const removed = pruneSettledBackgroundTasks();
    assert.ok(removed >= 1);
    assert.equal(getBackgroundTaskForTests("old"), null);
  });

  it("cancelOne 真 abort；错 runId 拒绝；幂等成功", () => {
    const signal = registerRunningBackgroundTaskForTests("live", { parentRunId: "run-a" });
    assert.equal(signal.aborted, false);
    assert.equal(
      cancelOneBackgroundTask("live", "Cancelled.", { expectedParentRunId: "run-b" }).ok,
      false,
    );
    assert.equal(signal.aborted, false);
    assert.equal(
      cancelOneBackgroundTask("live", "Cancelled.", { expectedParentRunId: "run-a" }).ok,
      true,
    );
    assert.equal(signal.aborted, true);
    const snap = getBackgroundTaskForTests("live");
    assert.equal(snap?.status, "cancelled");
    assert.equal(snap?.aborted, true);
    // 已非 running：幂等 ok
    assert.equal(cancelOneBackgroundTask("live").ok, true);
    assert.equal(cancelOneBackgroundTask("missing").ok, false);
  });

  it("ChatMode：task_cancel 与 Task 同门控", () => {
    setChatMode("ask");
    assert.equal(isToolAllowedForChatMode("task_cancel"), false);
    setChatMode("agent");
    assert.equal(isToolAllowedForChatMode("task_cancel"), true);
    assert.equal(isToolAllowedForChatMode("task_cancel", { allowTask: false }), false);
  });
});
