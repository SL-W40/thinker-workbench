/**
 * update_plan 执行体：参数校验与输出摘要。
 * 不在 run 内时 emitter 为空，应静默不抛错。
 */
import assert from "node:assert/strict";
import type { ChatTodo } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { planUpdateHint, updatePlanTool } from "../../../src/tools/update_plan/execute";

function outputOf(result: Awaited<ReturnType<typeof updatePlanTool>>): string {
  return typeof result === "string" ? result : result.output;
}

describe("updatePlanTool", () => {
  it("todos 非数组时业务失败", async () => {
    const result = await updatePlanTool({ todos: "nope" });
    assert.equal(typeof result === "object" ? result.ok : undefined, false);
  });

  it("合法入参返回进度摘要", async () => {
    const result = await updatePlanTool({
      status: "building",
      todos: [
        { id: "t1", label: "已做", status: "done" },
        { id: "t2", label: "在做", status: "in_progress" },
      ],
    });
    const output = outputOf(result);
    assert.equal(output.includes("status=building"), true);
    assert.equal(output.includes("1/2"), true);
  });

  it("空数组表示清空待办，缺 status 时视为执行中", async () => {
    const output = outputOf(await updatePlanTool({ todos: [] }));
    assert.equal(output.includes("0/0"), true);
    assert.equal(output.includes("status=building"), true);
  });

  it("丢弃缺 label 的待办项", async () => {
    const output = outputOf(
      await updatePlanTool({ todos: [{ id: "x" }, { id: "t2", label: "有效", status: "done" }] }),
    );
    assert.equal(output.includes("1/1"), true);
  });
});

function todo(id: string, label: string, status: ChatTodo["status"]): ChatTodo {
  return { id, label, status };
}

describe("planUpdateHint", () => {
  it("分出完成 / 新增 / 删除 / 退回，并给进度", () => {
    const before = [
      todo("t1", "搭骨架", "in_progress"),
      todo("t2", "写测试", "pending"),
      todo("t3", "旧步骤", "pending"),
      todo("t4", "补文档", "done"),
    ];
    const after = [
      todo("t1", "搭骨架", "done"),
      todo("t2", "写测试", "pending"),
      todo("t5", "接数据库", "pending"),
      todo("t4", "补文档", "in_progress"),
    ];
    const hint = planUpdateHint(before, after);
    assert.equal(hint.total, 4);
    assert.equal(hint.done, 1);
    assert.deepEqual(hint.completed, ["搭骨架"]);
    assert.deepEqual(hint.added, ["接数据库"]);
    assert.deepEqual(hint.removed, ["旧步骤"]);
    assert.deepEqual(hint.reopened, ["补文档"]);
  });

  it("只有状态推进时不带新增 / 删除", () => {
    const hint = planUpdateHint([todo("t1", "a", "pending")], [todo("t1", "a", "in_progress")]);
    assert.equal(hint.completed, undefined);
    assert.equal(hint.added, undefined);
    assert.equal(hint.removed, undefined);
    assert.equal(hint.reopened, undefined);
    assert.equal(hint.total, 1);
    assert.equal(hint.done, 0);
  });

  it("每类文案最多带 4 条，避免一行塞满", () => {
    const after = Array.from({ length: 6 }, (_, i) => todo(`n${i}`, `新${i}`, "pending"));
    const hint = planUpdateHint([], after);
    assert.equal(hint.added?.length, 4);
    assert.equal(hint.total, 6);
  });
});
