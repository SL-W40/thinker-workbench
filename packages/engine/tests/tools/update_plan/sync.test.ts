/**
 * update_plan 与会话待办的同步关系：计划拥有会话待办时同步，独立时不动。
 */
import assert from "node:assert/strict";
import { type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { type RunContext, runWithContext } from "../../../src/runtime/runContext";
import type { RunEmitEvent } from "../../../src/runtime/runEmit";
import { updatePlanTool } from "../../../src/tools/update_plan/execute";

type Harness = {
  events: RunEmitEvent[];
  todos: () => ChatTodo[];
  run: <T>(work: () => Promise<T>) => Promise<T>;
};

function harness(initial: ChatTodo[], planOwnsTodos: boolean): Harness {
  const events: RunEmitEvent[] = [];
  const ctx = {
    runId: "r1",
    threadId: "th1",
    sessionId: "s1",
    workspaceRoot: "",
    todos: [...initial],
    planOwnsTodos,
    emit: (event: RunEmitEvent) => {
      events.push(event);
    },
  } as unknown as RunContext;
  return {
    events,
    todos: () => ctx.todos,
    run: <T>(work: () => Promise<T>) => runWithContext(ctx, work),
  };
}

const STEP = [{ id: "n1", label: "新步骤", status: "done" }];

describe("updatePlanTool 与会话待办", () => {
  it("计划拥有会话待办时同步推送 todo 事件", async () => {
    const h = harness(normalizeTodos([{ id: "n1", label: "新步骤", status: "pending" }]), true);
    await h.run(() => updatePlanTool({ status: "building", todos: STEP }));
    const event = h.events.find((e) => e.type === "todo");
    assert.equal(event?.type === "todo" ? event.origin : undefined, "update_plan");
    assert.equal(h.todos()[0]?.status, "done");
  });

  it("计划独立（保留独立待办）时不动会话待办", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "旧待办", status: "pending" }]), false);
    await h.run(() => updatePlanTool({ status: "building", todos: STEP }));
    assert.equal(
      h.events.some((e) => e.type === "todo"),
      false,
    );
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["t1"],
    );
  });
});
