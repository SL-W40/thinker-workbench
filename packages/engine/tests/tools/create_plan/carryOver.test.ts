/**
 * create_plan 的旧账处置：会话里还有未完成待办时，先问用户再落地计划。
 */
import assert from "node:assert/strict";
import { type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";
import { beforeEach, describe, it, vi } from "vitest";
import { type RunContext, runWithContext } from "../../../src/runtime/runContext";
import type { RunEmitEvent } from "../../../src/runtime/runEmit";
import { createPlanTool } from "../../../src/tools/create_plan/execute";

/** 假 HITL：按用例设置的选择作答。 */
const hitl = vi.hoisted(() => ({ choice: "merge", calls: 0 }));

vi.mock("../../../src/hitl/requestHitl", () => ({
  requestHitl: async () => {
    hitl.calls += 1;
    return {
      hitlId: "hitl_1",
      actionId: "submit",
      values: { answers: [{ id: "carry_over", optionId: hitl.choice }] },
    };
  },
}));

/** 旧账：一项已完成、一项待开始、一项进行中。 */
const OLD: ChatTodo[] = normalizeTodos([
  { id: "t1", label: "旧已完成", status: "done" },
  { id: "t2", label: "旧待开始", status: "pending" },
  { id: "t3", label: "旧进行中", status: "in_progress" },
]);

const INCOMING = [{ id: "n1", label: "新步骤一", status: "pending" }];

type Harness = {
  events: RunEmitEvent[];
  todos: () => ChatTodo[];
  owns: () => boolean;
  run: <T>(work: () => Promise<T>) => Promise<T>;
};

function harness(initial: ChatTodo[]): Harness {
  const events: RunEmitEvent[] = [];
  const ctx = {
    runId: "r1",
    threadId: "th1",
    sessionId: "s1",
    workspaceRoot: "",
    todos: [...initial],
    planOwnsTodos: true,
    emit: (event: RunEmitEvent) => {
      events.push(event);
    },
  } as unknown as RunContext;
  return {
    events,
    todos: () => ctx.todos,
    owns: () => ctx.planOwnsTodos,
    run: <T>(work: () => Promise<T>) => runWithContext(ctx, work),
  };
}

/** 取计划事件里的待办 id 列表。 */
function planTodoIds(events: RunEmitEvent[]): string[] {
  const event = events.find((e) => e.type === "plan");
  if (event?.type !== "plan") return [];
  return event.todos.map((t) => t.id);
}

/** 取 todo 事件（会话待办同步）。 */
function todoEvent(events: RunEmitEvent[]): Extract<RunEmitEvent, { type: "todo" }> | undefined {
  return events.find((e) => e.type === "todo") as
    | Extract<RunEmitEvent, { type: "todo" }>
    | undefined;
}

function create(h: Harness) {
  return h.run(() =>
    createPlanTool({ title: "新计划", todos: INCOMING, markdown: "# 新计划" }, {
      workspaceRoot: "",
      signal: undefined,
    } as never),
  );
}

beforeEach(() => {
  hitl.calls = 0;
  hitl.choice = "merge";
});

describe("createPlanTool 旧账处置", () => {
  it("没有未完成待办时直接落地，不打扰用户", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "已完成", status: "done" }]));
    await create(h);
    assert.equal(hitl.calls, 0);
    assert.deepEqual(planTodoIds(h.events), ["n1"]);
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["n1"],
    );
  });

  it("合并：旧未完成项排在计划前面，会话待办同步", async () => {
    const h = harness(OLD);
    hitl.choice = "merge";
    await create(h);
    assert.equal(hitl.calls, 1);
    assert.deepEqual(planTodoIds(h.events), ["t2", "t3", "n1"]);
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["t2", "t3", "n1"],
    );
    assert.equal(todoEvent(h.events)?.origin, "create_plan");
  });

  it("放弃：计划只留新步骤，旧待办随之清空", async () => {
    const h = harness(OLD);
    hitl.choice = "discard";
    await create(h);
    assert.deepEqual(planTodoIds(h.events), ["n1"]);
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["n1"],
    );
  });

  it("保留独立：计划只管自己的步骤，会话待办原样保留", async () => {
    const h = harness(OLD);
    hitl.choice = "keep";
    await create(h);
    assert.deepEqual(planTodoIds(h.events), ["n1"]);
    // 会话待办不动，也不推 todo 事件
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["t1", "t2", "t3"],
    );
    assert.equal(todoEvent(h.events), undefined);
    // 后续 update_plan 不再覆写会话待办
    assert.equal(h.owns(), false);
  });

  it("答复读不出来时回落合并（不静默丢掉旧待办）", async () => {
    const h = harness(OLD);
    hitl.choice = "看不懂的选项";
    await create(h);
    assert.deepEqual(planTodoIds(h.events), ["t2", "t3", "n1"]);
  });
});
