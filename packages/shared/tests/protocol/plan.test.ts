/**
 * 计划领域逻辑（plan.ts）：状态判定与活跃计划选取。
 *
 * 计划由 create_plan 工具以结构化参数产出，这里不再涉及任何文本 / frontmatter 解析；
 * 待办已独立成会话级能力，用例见同目录 todo.test.ts。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatMessage, ChatPlan } from "../../src/protocol/message";
import { activePlanOf, isPlanStatus } from "../../src/protocol/plan";

function plan(overrides: Partial<ChatPlan> = {}): ChatPlan {
  return {
    id: "p1",
    title: "飞机大战",
    status: "building",
    todos: [
      { id: "t1", label: "数据模型", status: "done" },
      { id: "t2", label: "底部渲染", status: "in_progress" },
    ],
    markdown: "# 计划\n\n正文。",
    ...overrides,
  };
}

function msg(id: string, p?: ChatPlan): ChatMessage {
  return { id, role: "assistant", text: "", plan: p };
}

describe("activePlanOf", () => {
  it("取最后一条带 plan 的消息", () => {
    const messages = [msg("m1", plan({ id: "old" })), msg("m2"), msg("m3", plan({ id: "new" }))];
    assert.equal(activePlanOf(messages)?.id, "new");
  });

  it("无 plan 时返回 null", () => {
    assert.equal(activePlanOf([msg("m1"), msg("m2")]), null);
    assert.equal(activePlanOf([]), null);
  });
});

describe("isPlanStatus", () => {
  it("只接受合法取值", () => {
    assert.equal(isPlanStatus("building"), true);
    assert.equal(isPlanStatus("nope"), false);
  });
});
