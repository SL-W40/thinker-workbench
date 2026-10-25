/**
 * 会话待办领域逻辑（todo.ts）：规范化、未完成判定、进度与合并。
 *
 * 待办独立于计划存在：`todo` 工具可单独规划步骤，计划只是它的一个来源。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isTodoStatus,
  mergeTodos,
  normalizeTodos,
  todoProgress,
  unfinishedTodos,
} from "../../src/protocol/todo";

describe("normalizeTodos", () => {
  it("缺 id 按序补 t{n}，已给 id 原样保留", () => {
    const todos = normalizeTodos([{ label: "有 label" }, { id: "t9", label: "有效" }]);
    assert.equal(todos.length, 2);
    assert.equal(todos[0]?.id, "t1");
    assert.equal(todos[0]?.status, "pending");
    assert.equal(todos[1]?.id, "t9");
  });

  it("丢弃缺 label 的项", () => {
    assert.deepEqual(normalizeTodos([{ id: "x" }, { id: "y", label: "  " }]), []);
    assert.equal(normalizeTodos([{ id: "x" }, { label: "有效" }]).length, 1);
  });

  it("状态非法回落 pending；非数组返回空", () => {
    assert.equal(normalizeTodos([{ label: "x", status: "nope" }])[0]?.status, "pending");
    assert.deepEqual(normalizeTodos("x"), []);
    assert.deepEqual(normalizeTodos(undefined), []);
  });
});

describe("isTodoStatus", () => {
  it("只接受合法取值", () => {
    assert.equal(isTodoStatus("in_progress"), true);
    assert.equal(isTodoStatus("done-ish"), false);
  });
});

describe("unfinishedTodos", () => {
  it("pending 与 in_progress 都算未完成", () => {
    const todos = normalizeTodos([
      { id: "t1", label: "a", status: "done" },
      { id: "t2", label: "b", status: "in_progress" },
      { id: "t3", label: "c", status: "pending" },
    ]);
    assert.deepEqual(
      unfinishedTodos(todos).map((t) => t.id),
      ["t2", "t3"],
    );
  });
});

describe("todoProgress", () => {
  it("统计已完成与总数", () => {
    const todos = normalizeTodos([
      { id: "t1", label: "a", status: "done" },
      { id: "t2", label: "b", status: "in_progress" },
    ]);
    assert.deepEqual(todoProgress(todos), { done: 1, total: 2 });
    assert.deepEqual(todoProgress([]), { done: 0, total: 0 });
  });
});

describe("mergeTodos", () => {
  it("旧未完成项排在新列表前面，按 id 去重", () => {
    const base = normalizeTodos([
      { id: "old1", label: "旧账", status: "pending" },
      { id: "done1", label: "旧已完成", status: "done" },
      { id: "same", label: "旧的同一项", status: "in_progress" },
    ]);
    const incoming = normalizeTodos([
      { id: "same", label: "新计划里的同一项", status: "pending" },
      { id: "n1", label: "新步骤", status: "pending" },
    ]);
    const merged = mergeTodos(base, incoming);
    assert.deepEqual(
      merged.map((t) => t.id),
      ["old1", "same", "n1"],
    );
    // 同 id 时保留新计划的表述
    assert.equal(merged.find((t) => t.id === "same")?.label, "新计划里的同一项");
  });

  it("无未完成项时原样返回新列表", () => {
    const base = normalizeTodos([{ id: "t1", label: "a", status: "done" }]);
    const incoming = normalizeTodos([{ id: "n1", label: "b" }]);
    assert.deepEqual(mergeTodos(base, incoming), incoming);
  });
});
