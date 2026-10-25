/**
 * todo 工具的待办变换（纯函数）：动作解析、增删改与排版。
 */
import assert from "node:assert/strict";
import { type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  addTodos,
  completeTodos,
  formatTodos,
  nextTodoId,
  parseTodoAction,
  parseTodoIds,
  parseTodoItems,
  removeTodos,
  summarizeTodos,
  updateTodos,
} from "../../../src/tools/todo/todos";

const BASE: ChatTodo[] = normalizeTodos([
  { id: "t1", label: "搭骨架", status: "done" },
  { id: "t2", label: "渲染", status: "in_progress" },
]);

describe("parseTodoAction", () => {
  it("只接受五种动作", () => {
    assert.equal(parseTodoAction("list"), "list");
    assert.equal(parseTodoAction(" add "), "add");
    assert.equal(parseTodoAction("nope"), null);
    assert.equal(parseTodoAction(undefined), null);
  });
});

describe("parseTodoItems", () => {
  it("字符串项当 label，非数组返回空", () => {
    assert.deepEqual(parseTodoItems(["写测试"]), [{ label: "写测试" }]);
    assert.deepEqual(parseTodoItems("x"), []);
  });
});

describe("parseTodoIds", () => {
  it("去重并丢弃空 id", () => {
    assert.deepEqual(parseTodoIds([{ id: "t1" }, { id: "t1" }, { id: "  " }, {}]), ["t1"]);
  });
});

describe("nextTodoId", () => {
  it("按 t{n} 续号", () => {
    assert.equal(nextTodoId([]), "t1");
    assert.equal(nextTodoId(BASE), "t3");
    assert.equal(nextTodoId([{ id: "x", label: "非序号", status: "pending" }]), "t1");
  });
});

describe("addTodos", () => {
  it("追加并续号，撞号时重新分配", () => {
    const next = addTodos(BASE, [{ label: "补测试" }, { id: "t2", label: "撞号" }]);
    assert.deepEqual(
      next.map((t) => t.id),
      ["t1", "t2", "t3", "t4"],
    );
    assert.equal(next[3]?.label, "撞号");
    assert.equal(next[2]?.status, "pending");
  });
});

describe("updateTodos", () => {
  it("按 id 改 label / status，未给字段保持原值", () => {
    const { todos, missing } = updateTodos(BASE, [{ id: "t2", status: "done" }]);
    assert.deepEqual(missing, []);
    assert.equal(todos[1]?.status, "done");
    assert.equal(todos[1]?.label, "渲染");
  });

  it("改 label 时去空白；未知 id 进 missing", () => {
    const { todos, missing } = updateTodos(BASE, [
      { id: "t1", label: "  新描述  " },
      { id: "zz", label: "不存在" },
    ]);
    assert.deepEqual(missing, ["zz"]);
    assert.equal(todos[0]?.label, "新描述");
  });
});

describe("completeTodos", () => {
  it("按 id 置 done，未知 id 报 missing", () => {
    const { todos, missing } = completeTodos(BASE, ["t2", "zz"]);
    assert.deepEqual(missing, ["zz"]);
    assert.equal(todos[1]?.status, "done");
  });
});

describe("removeTodos", () => {
  it("按 id 移除，未知 id 报 missing", () => {
    const { todos, missing } = removeTodos(BASE, ["t1", "zz"]);
    assert.deepEqual(missing, ["zz"]);
    assert.deepEqual(
      todos.map((t) => t.id),
      ["t2"],
    );
  });
});

describe("排版", () => {
  it("列表带状态与进度", () => {
    const text = formatTodos(BASE);
    assert.match(text, /1\/2 已完成/);
    assert.match(text, /\[done\] t1 搭骨架/);
    assert.match(text, /\[in_progress\] t2 渲染/);
  });

  it("空列表有明确提示", () => {
    assert.equal(formatTodos([]), "当前没有待办。");
    assert.match(summarizeTodos(BASE), /当前 2 项，已完成 1 项/);
  });
});
