/**
 * 消息落库回读计划（messages.ts readPlan）：脏数据防御。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readPlan } from "../../../src/db/workspacesStore/messages";

/** 一条完整合法的计划。 */
const PLAN = {
  id: "plan-s1",
  title: "飞机大战",
  description: "一个网页游戏",
  status: "building",
  todos: [{ id: "t1", label: "步骤", status: "done" }],
  markdown: "# 计划",
};

describe("readPlan", () => {
  it("回读合法计划", () => {
    const plan = readPlan(PLAN);
    assert.equal(plan?.id, "plan-s1");
    assert.equal(plan?.title, "飞机大战");
    assert.equal(plan?.description, "一个网页游戏");
    assert.equal(plan?.status, "building");
    assert.equal(plan?.todos.length, 1);
    assert.equal(plan?.markdown, "# 计划");
  });

  it("缺 id 或 id 为空时丢弃", () => {
    assert.equal(readPlan({ ...PLAN, id: undefined }), undefined);
    assert.equal(readPlan({ ...PLAN, id: "  " }), undefined);
  });

  it("状态非法时丢弃", () => {
    assert.equal(readPlan({ ...PLAN, status: "nope" }), undefined);
  });

  it("todos 非数组时回退空数组", () => {
    assert.deepEqual(readPlan({ ...PLAN, todos: "x" })?.todos, []);
  });

  it("非对象一律丢弃", () => {
    assert.equal(readPlan(null), undefined);
    assert.equal(readPlan("plan"), undefined);
    assert.equal(readPlan(undefined), undefined);
  });
});
