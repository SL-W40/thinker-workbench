/**
 * 会话待办落库形态（sessionTodos.ts）：脏数据一律降级成合法结构。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readSessionTodos, writeSessionTodos } from "../../../src/db/workspacesStore/sessionTodos";

describe("readSessionTodos", () => {
  it("回读合法待办", () => {
    const todos = readSessionTodos(
      JSON.stringify([
        { id: "t1", label: "搭骨架", status: "done" },
        { id: "t2", label: "渲染", status: "in_progress" },
      ]),
    );
    assert.deepEqual(todos, [
      { id: "t1", label: "搭骨架", status: "done" },
      { id: "t2", label: "渲染", status: "in_progress" },
    ]);
  });

  it("空列 / NULL 视为空列表", () => {
    assert.deepEqual(readSessionTodos(null), []);
    assert.deepEqual(readSessionTodos(undefined), []);
    assert.deepEqual(readSessionTodos("   "), []);
  });

  it("非法 JSON 或结构不合法降级为空列表", () => {
    assert.deepEqual(readSessionTodos("{oops"), []);
    assert.deepEqual(readSessionTodos(JSON.stringify({ nope: 1 })), []);
    // 缺 label 的项被丢弃，缺 id 按序补齐
    assert.deepEqual(readSessionTodos(JSON.stringify([{ id: "x" }, { label: "有效" }])), [
      { id: "t2", label: "有效", status: "pending" },
    ]);
  });
});

describe("writeSessionTodos", () => {
  it("空列表写 NULL，避免行内噪声", () => {
    assert.equal(writeSessionTodos([]), null);
    assert.equal(writeSessionTodos(undefined), null);
  });

  it("写前规范化：丢弃缺 label 项、非法状态回落", () => {
    const raw = writeSessionTodos([
      { id: "t1", label: " 有效 ", status: "done" },
      { id: "t2", label: "", status: "pending" },
      { id: "t3", label: "怪状态", status: "nope" as never },
    ]);
    assert.deepEqual(JSON.parse(String(raw)), [
      { id: "t1", label: "有效", status: "done" },
      { id: "t3", label: "怪状态", status: "pending" },
    ]);
  });

  it("落库再回读是同一份（往返一致）", () => {
    const todos = [{ id: "t1", label: "步骤", status: "pending" as const }];
    assert.deepEqual(readSessionTodos(writeSessionTodos(todos)), todos);
  });
});
