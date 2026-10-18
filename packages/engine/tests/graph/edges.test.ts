/**
 * 默认图的条件边：无工具结束、打满 pending 先 drain。
 * 步数预算不在这里：超限由 LangGraph recursionLimit 统一收尾。
 */
import assert from "node:assert/strict";
import { END } from "@langchain/langgraph";
import { describe, it } from "vitest";
import type { AgentGraphState } from "../../src/graph/annotation";
import { buildGraph } from "../../src/graph/buildGraph";
import { afterAgent, afterTools } from "../../src/graph/edges";

function state(partial: Partial<AgentGraphState>): AgentGraphState {
  return {
    message: "hi",
    messages: [],
    reply: "",
    pendingToolCalls: [],
    startedToolCallIds: [],
    ...partial,
  };
}

const toolCall = {
  id: "c1",
  type: "function" as const,
  function: { name: "read_file", arguments: "{}" },
};

describe("graph edges", () => {
  it("agent 后：无工具结束；有工具进 tools", () => {
    assert.equal(afterAgent(state({})), END);
    assert.equal(afterAgent(state({ pendingToolCalls: [toolCall] })), "tools");
  });

  it("tools 后：还有 pending 继续 tools；否则回 agent", () => {
    assert.equal(afterTools(state({ pendingToolCalls: [toolCall] })), "tools");
    assert.equal(afterTools(state({})), "agent");
  });

  it("buildGraph 可编译", () => {
    const graph = buildGraph();
    assert.ok(graph);
    assert.equal(typeof graph.stream, "function");
    assert.equal(typeof graph.getState, "function");
  });
});
