/**
 * todo 工具执行体：动作分派、本轮镜像写入与 todo 事件推送。
 * 工具必须在 run 内（有 ALS）才会读写待办镜像。
 */
import assert from "node:assert/strict";
import { type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { type RunContext, runWithContext } from "../../../src/runtime/runContext";
import type { RunEmitEvent } from "../../../src/runtime/runEmit";
import { todoTool } from "../../../src/tools/todo/execute";

type Harness = {
  events: RunEmitEvent[];
  todos: () => ChatTodo[];
  owns: () => boolean;
  run: <T>(work: () => Promise<T>) => Promise<T>;
};

/** 造一个最小 run 上下文：只填 todo 工具需要的字段。 */
function harness(initial: ChatTodo[] = []): Harness {
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

function output(result: Awaited<ReturnType<typeof todoTool>>): string {
  return typeof result === "string" ? result : result.output;
}

function ok(result: Awaited<ReturnType<typeof todoTool>>): boolean | undefined {
  return typeof result === "object" ? result.ok : undefined;
}

describe("todoTool", () => {
  it("action 非法时业务失败", async () => {
    const h = harness();
    const result = await h.run(() => todoTool({ action: "nope" }));
    assert.equal(ok(result), false);
    assert.equal(h.events.length, 0);
  });

  it("list 只读：不改镜像也不发事件", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "搭骨架", status: "done" }]));
    const text = output(await h.run(() => todoTool({ action: "list" })));
    assert.match(text, /搭骨架/);
    assert.equal(h.events.length, 0);
    assert.equal(h.todos().length, 1);
  });

  it("add 追加并推 todo 事件", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "搭骨架", status: "done" }]));
    const text = output(
      await h.run(() => todoTool({ action: "add", items: [{ label: "写测试" }] })),
    );
    assert.equal(h.todos().length, 2);
    assert.equal(h.todos()[1]?.id, "t2");
    assert.match(text, /新增/);
    const event = h.events[0];
    assert.equal(event?.type, "todo");
    if (event?.type === "todo") {
      assert.equal(event.todos.length, 2);
      assert.equal(event.origin, "todo");
    }
  });

  it("update 改状态，未知 id 报错且不改镜像", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "搭骨架", status: "pending" }]));
    const okResult = await h.run(() =>
      todoTool({ action: "update", items: [{ id: "t1", status: "in_progress" }] }),
    );
    assert.equal(h.todos()[0]?.status, "in_progress");
    assert.equal(ok(okResult), undefined);

    const bad = await h.run(() => todoTool({ action: "update", items: [{ id: "zz" }] }));
    assert.equal(ok(bad), false);
    assert.equal(h.events.length, 1);
  });

  it("complete 与 remove 分别置 done / 移除", async () => {
    const h = harness(
      normalizeTodos([
        { id: "t1", label: "a", status: "pending" },
        { id: "t2", label: "b", status: "pending" },
      ]),
    );
    await h.run(() => todoTool({ action: "complete", items: [{ id: "t1" }] }));
    assert.equal(h.todos()[0]?.status, "done");
    await h.run(() => todoTool({ action: "remove", items: [{ id: "t2" }] }));
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["t1"],
    );
    assert.equal(h.events.length, 2);
  });

  it("items 缺失（非 list）时业务失败", async () => {
    const h = harness();
    assert.equal(ok(await h.run(() => todoTool({ action: "add" }))), false);
    assert.equal(ok(await h.run(() => todoTool({ action: "add", items: [] }))), false);
  });

  it("不在 run 内时不抛错", async () => {
    const text = output(await todoTool({ action: "list" }));
    assert.match(text, /没有待办/);
  });

  it("list 把当前待办快照给时间线（无增删标注）", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "搭骨架", status: "done" }]));
    const result = await h.run(() => todoTool({ action: "list" }));
    assert.ok(typeof result === "object");
    assert.deepEqual(result.ui?.todos, [{ id: "t1", label: "搭骨架", status: "done" }]);
    assert.equal(result.ui?.todoAdded, undefined);
    assert.equal(result.ui?.todoRemoved, undefined);
  });

  it("add 后快照带新增 id（标绿）", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "搭骨架", status: "done" }]));
    const result = await h.run(() => todoTool({ action: "add", items: [{ label: "写测试" }] }));
    assert.ok(typeof result === "object");
    assert.deepEqual(result.ui?.todoAdded, ["t2"]);
    assert.equal(result.ui?.todoRemoved, undefined);
    // 快照含全部两项（新增的接在末尾）
    assert.deepEqual(
      result.ui?.todos?.map((t) => t.id),
      ["t1", "t2"],
    );
  });

  it("remove 后快照仍保留被删项并给出删除 id（标红）", async () => {
    const h = harness(
      normalizeTodos([
        { id: "t1", label: "a", status: "pending" },
        { id: "t2", label: "b", status: "pending" },
      ]),
    );
    const result = await h.run(() => todoTool({ action: "remove", items: [{ id: "t2" }] }));
    assert.ok(typeof result === "object");
    assert.deepEqual(result.ui?.todoRemoved, ["t2"]);
    // 被删的项留在原位供卡片标红，镜像里则已移除
    assert.deepEqual(
      result.ui?.todos?.map((t) => t.id),
      ["t1", "t2"],
    );
    assert.deepEqual(
      h.todos().map((t) => t.id),
      ["t1"],
    );
  });

  it("complete 的快照沿用新状态但无增删", async () => {
    const h = harness(normalizeTodos([{ id: "t1", label: "a", status: "pending" }]));
    const result = await h.run(() => todoTool({ action: "complete", items: [{ id: "t1" }] }));
    assert.ok(typeof result === "object");
    assert.deepEqual(result.ui?.todos, [{ id: "t1", label: "a", status: "done" }]);
    assert.equal(result.ui?.todoAdded, undefined);
    assert.equal(result.ui?.todoRemoved, undefined);
  });
});
