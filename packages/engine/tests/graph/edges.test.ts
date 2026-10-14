/**
 * 默认图的条件边：无工具结束、打满步数先 drain、tools 之后回 agent 或结束。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { configureRuntimeLimits, getMaxAgentSteps } from "../../src/config/runtimeLimits";
import { buildGraph } from "../../src/graph/buildGraph";
import { afterAgent, afterTools } from "../../src/graph/edges";
import type { GraphState } from "../../src/graph/types";

function state(partial: Partial<GraphState>): GraphState {
  return {
    message: "hi",
    messages: [],
    reply: "",
    pendingToolCalls: [],
    startedToolCallIds: [],
    step: 0,
    ...partial,
  };
}

const toolCall = {
  id: "c1",
  type: "function" as const,
  function: { name: "read_file", arguments: "{}" },
};

describe("graph edges", () => {
  afterEach(() => {
    configureRuntimeLimits({ maxAgentSteps: 16 });
  });

  it("没有待执行工具就结束；有工具则进 tools，即使步数已满也先 drain", () => {
    assert.equal(afterAgent(state({})), null);
    assert.equal(afterAgent(state({ pendingToolCalls: [toolCall], step: 1 })), "tools");
    configureRuntimeLimits({ maxAgentSteps: 2 });
    assert.equal(getMaxAgentSteps(), 2);
    assert.equal(afterAgent(state({ pendingToolCalls: [toolCall], step: 2 })), "tools");
  });

  it("tools 后还有 pending 继续 tools；步数满则结束；否则回 agent", () => {
    assert.equal(afterTools(state({ pendingToolCalls: [toolCall], step: 1 })), "tools");
    assert.equal(afterTools(state({ step: 1 })), "agent");
    configureRuntimeLimits({ maxAgentSteps: 3 });
    assert.equal(afterTools(state({ step: 3 })), null);
  });

  it("默认图从 agent 出发，边就是 afterAgent / afterTools", () => {
    const graph = buildGraph();
    assert.equal(graph.start, "agent");
    assert.equal(typeof graph.nodes.agent, "function");
    assert.equal(typeof graph.nodes.tools, "function");
    assert.equal(graph.edges.agent, afterAgent);
    assert.equal(graph.edges.tools, afterTools);
  });
});
