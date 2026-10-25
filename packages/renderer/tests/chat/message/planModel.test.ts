/**
 * 计划事件合并（planModel.ts）：created 挂目标消息、updated 更新活跃计划。
 */
import assert from "node:assert/strict";
import type { AgentPlanEvent, ChatMessage, ChatTodo } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  applyPlanCreated,
  applyPlanUpdated,
  applySessionTodosToPlan,
} from "../../../src/features/chat/message/planModel";

function msg(id: string, plan?: ChatMessage["plan"]): ChatMessage {
  return { id, role: "assistant", text: "", ...(plan ? { plan } : {}) };
}

const PLAN = {
  id: "plan-s1",
  status: "ready" as const,
  todos: [{ id: "t1", label: "步骤", status: "pending" as const }],
  markdown: "# 计划",
};

function event(overrides: Partial<AgentPlanEvent> = {}): AgentPlanEvent {
  return {
    type: "plan",
    phase: "updated",
    planId: "plan-s1",
    status: "building",
    todos: [{ id: "t1", label: "步骤", status: "done" }],
    threadId: "th1",
    runId: "run1",
    ts: 0,
    ...overrides,
  };
}

describe("applyPlanCreated", () => {
  it("把计划挂到目标助手消息", () => {
    const next = applyPlanCreated(
      [msg("m1"), msg("m2")],
      "m2",
      event({ phase: "created", status: "ready" }),
    );
    assert.equal(next[0]?.plan, undefined);
    assert.equal(next[1]?.plan?.status, "ready");
    assert.equal(next[1]?.plan?.id, "plan-s1");
  });
});

describe("applyPlanCreated", () => {
  it("把标题与描述一起挂到目标消息", () => {
    const next = applyPlanCreated(
      [msg("m2")],
      "m2",
      event({ phase: "created", title: "飞机大战", description: "一个网页游戏" }),
    );
    assert.equal(next[0]?.plan?.title, "飞机大战");
    assert.equal(next[0]?.plan?.description, "一个网页游戏");
  });
});

describe("applyPlanCreated", () => {
  it("drafting 草稿逐段覆盖，正文沿用上一段", () => {
    const messages = [
      msg("m2", { ...PLAN, title: "飞机", description: "游戏", markdown: "# 计划" }),
    ];
    const next = applyPlanCreated(
      messages,
      "m2",
      event({ phase: "drafting", callId: "call_1", title: "飞机大战", description: "网页游戏" }),
    );
    assert.equal(next[0]?.plan?.title, "飞机大战");
    assert.equal(next[0]?.plan?.description, "网页游戏");
    // 草稿不带正文：不能把已有正文清空
    assert.equal(next[0]?.plan?.markdown, "# 计划");
  });
});

describe("applyPlanUpdated", () => {
  it("未带标题 / 描述时沿用既有值", () => {
    const messages = [
      msg("m1", {
        id: "plan-s1",
        title: "旧标题",
        description: "旧描述",
        status: "ready",
        todos: [],
        markdown: "# 计划",
      }),
    ];
    const next = applyPlanUpdated(messages, event());
    assert.equal(next[0]?.plan?.title, "旧标题");
    assert.equal(next[0]?.plan?.description, "旧描述");
  });
});

describe("applyPlanUpdated", () => {
  it("更新最后一条带 plan 的消息", () => {
    const messages = [msg("m1", PLAN), msg("m2"), msg("m3", { ...PLAN, id: "plan-old" })];
    const next = applyPlanUpdated(messages, event());
    assert.equal(next[0]?.plan?.status, "ready");
    assert.equal(next[2]?.plan?.status, "building");
    assert.equal(next[2]?.plan?.todos[0]?.status, "done");
  });

  it("事件不带正文时沿用已有正文", () => {
    const next = applyPlanUpdated([msg("m1", PLAN)], event());
    assert.equal(next[0]?.plan?.markdown, "# 计划");
  });

  it("事件带正文时覆盖", () => {
    const next = applyPlanUpdated([msg("m1", PLAN)], event({ markdown: "# 新版" }));
    assert.equal(next[0]?.plan?.markdown, "# 新版");
  });

  it("会话内没有计划时原样返回", () => {
    const messages = [msg("m1"), msg("m2")];
    assert.deepEqual(applyPlanUpdated(messages, event()), messages);
  });
});

describe("applySessionTodosToPlan", () => {
  const plan = {
    id: "plan-s1",
    title: "飞机大战",
    status: "building" as const,
    todos: [
      { id: "t1", label: "搭骨架", status: "pending" as const },
      { id: "t2", label: "跑起来", status: "pending" as const },
    ],
    markdown: "# 计划",
  };

  it("同 id 的待办跟随会话状态，计划文档不再滞后", () => {
    const todos: ChatTodo[] = [
      { id: "t1", label: "搭骨架", status: "done" },
      { id: "t2", label: "跑起来", status: "in_progress" },
    ];
    const next = applySessionTodosToPlan([msg("m1", plan)], todos);
    assert.deepEqual(
      next[0]?.plan?.todos.map((t) => t.status),
      ["done", "in_progress"],
    );
    // 其余字段不动
    assert.equal(next[0]?.plan?.title, "飞机大战");
    assert.equal(next[0]?.plan?.markdown, "# 计划");
  });

  it("会话里删除 / 新增的步骤同步进计划", () => {
    const todos: ChatTodo[] = [{ id: "t2", label: "跑起来", status: "done" }];
    const trimmed = applySessionTodosToPlan([msg("m1", plan)], todos);
    assert.deepEqual(
      trimmed[0]?.plan?.todos.map((t) => t.id),
      ["t2"],
    );

    const added = applySessionTodosToPlan(
      [msg("m1", plan)],
      [
        { id: "t1", label: "搭骨架", status: "done" },
        { id: "t2", label: "跑起来", status: "pending" },
        { id: "t3", label: "补测试", status: "pending" },
      ],
    );
    assert.deepEqual(
      added[0]?.plan?.todos.map((t) => t.id),
      ["t1", "t2", "t3"],
    );
  });

  it("独立计划（id 无交集）不跟着会话待办走", () => {
    const messages = [msg("m1", plan)];
    const next = applySessionTodosToPlan(messages, [
      { id: "s1", label: "会话自己的事", status: "done" },
    ]);
    assert.equal(next, messages);
    assert.deepEqual(
      next[0]?.plan?.todos.map((t) => t.id),
      ["t1", "t2"],
    );
  });

  it("没有计划时不做任何改动", () => {
    const messages = [msg("m1")];
    const next = applySessionTodosToPlan(messages, [{ id: "t1", label: "步骤", status: "done" }]);
    assert.equal(next, messages);
  });
});
