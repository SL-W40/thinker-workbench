/**
 * create_plan 执行体：参数校验、默认值与输出摘要。
 * 不在 run 内时 emitter 为空，应静默不抛错。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createPlanTool } from "../../../src/tools/create_plan/execute";

function outputOf(result: Awaited<ReturnType<typeof createPlanTool>>): string {
  return typeof result === "string" ? result : result.output;
}

describe("createPlanTool", () => {
  it("todos 非数组时业务失败", async () => {
    const result = await createPlanTool({ todos: "nope", markdown: "x" });
    assert.equal(typeof result === "object" ? result.ok : undefined, false);
  });

  it("合法入参返回摘要，状态缺省 ready", async () => {
    const output = outputOf(
      await createPlanTool({
        title: "飞机大战",
        description: "一个网页游戏",
        todos: [{ id: "t1", label: "搭骨架", status: "pending" }],
        markdown: "# 计划",
      }),
    );
    assert.ok(output.includes("飞机大战"));
    assert.ok(output.includes("1 个待办"));
    assert.ok(output.includes("status=ready"));
  });

  it("状态非法时回落 ready", async () => {
    const output = outputOf(await createPlanTool({ status: "nope", todos: [], markdown: "" }));
    assert.ok(output.includes("status=ready"));
  });

  it("丢弃缺 label 的待办项", async () => {
    const output = outputOf(
      await createPlanTool({
        todos: [{ id: "x" }, { id: "t2", label: "有效", status: "done" }],
        markdown: "",
      }),
    );
    assert.ok(output.includes("1 个待办"));
  });

  it("未给标题时用占位文案，不影响事件推送", async () => {
    const output = outputOf(await createPlanTool({ todos: [], markdown: "" }));
    assert.ok(output.includes("未命名"));
    assert.ok(output.includes("0 个待办"));
  });
});
