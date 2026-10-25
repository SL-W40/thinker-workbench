/**
 * create_plan 参数前缀解析：模型是逐字符吐 JSON 的，这里验证「吐到哪、读到哪」。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readPartialPlanArgs } from "../../../src/tools/create_plan/partial";

describe("readPartialPlanArgs", () => {
  it("只吐到标题一半时也能读出标题", () => {
    const fields = readPartialPlanArgs('{"title":"飞机大');
    assert.equal(fields.title, "飞机大");
    assert.equal(fields.status, "ready");
    assert.deepEqual(fields.todos, []);
  });

  it("完整参数：标题 / 描述 / 状态 / 待办都在", () => {
    const fields = readPartialPlanArgs(
      '{"title":"飞机大战","description":"网页游戏","status":"building","todos":[{"id":"t1","label":"骨架"},{"id":"t2","label":"渲染","status":"done"}]}',
    );
    assert.equal(fields.title, "飞机大战");
    assert.equal(fields.description, "网页游戏");
    assert.equal(fields.status, "building");
    assert.equal(fields.todos.length, 2);
    assert.equal(fields.todos[1]?.label, "渲染");
    assert.equal(fields.todos[1]?.status, "done");
  });

  it("待办数组吐到一半时只收已完整（或已有 label）的项", () => {
    const fields = readPartialPlanArgs(
      '{"title":"p","todos":[{"id":"t1","label":"骨架"},{"id":"t2","label":"渲染"}',
    );
    assert.equal(fields.todos.length, 2);
    assert.equal(fields.todos[0]?.id, "t1");
    assert.equal(fields.todos[1]?.id, "t2");
    assert.equal(fields.todos[1]?.status, "pending");
  });

  it("待办项写到一半时带上该项的 label", () => {
    const fields = readPartialPlanArgs('{"todos":[{"id":"t1","label":"正在生成的待办"');
    assert.equal(fields.todos.length, 1);
    assert.equal(fields.todos[0]?.label, "正在生成的待办");
    assert.equal(fields.todos[0]?.id, "t1");
  });

  it("缺 label 的待办项被丢弃", () => {
    const fields = readPartialPlanArgs('{"todos":[{"id":"t1"},{"label":"有效"}]}');
    assert.equal(fields.todos.length, 1);
    assert.equal(fields.todos[0]?.label, "有效");
  });

  it("非法状态回落 ready", () => {
    assert.equal(readPartialPlanArgs('{"status":"nope"}').status, "ready");
    assert.equal(readPartialPlanArgs('{"status":"done"}').status, "done");
  });

  it("转义字符被解出，未闭合字符串不丢内容", () => {
    const fields = readPartialPlanArgs('{"description":"第一行\\n第二行');
    assert.equal(fields.description, "第一行\n第二行");
  });

  it("畸形输入不抛错，返回空结构", () => {
    assert.deepEqual(readPartialPlanArgs('{"'), { status: "ready", todos: [] });
    assert.deepEqual(readPartialPlanArgs("nonsense"), { status: "ready", todos: [] });
    assert.deepEqual(readPartialPlanArgs(""), { status: "ready", todos: [] });
  });
});
