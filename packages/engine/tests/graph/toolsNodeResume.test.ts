/**
 * tools 节点：resume 路径 reuse / interrupt 不调用 runTool。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

const runTool = vi.hoisted(() => vi.fn());
const seedFailedBackgroundTask = vi.hoisted(() => vi.fn());
const markToolCallStarted = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../../src/tools/runTool", () => ({ runTool }));
vi.mock("../../src/tools/task/execute", async () => {
  const actual = await vi.importActual<typeof import("../../src/tools/task/execute")>(
    "../../src/tools/task/execute",
  );
  return {
    ...actual,
    seedFailedBackgroundTask,
    peekTaskLaunchesInBackground: () => false,
  };
});
vi.mock("../../src/runtime/runContext", async () => {
  const actual = await vi.importActual<typeof import("../../src/runtime/runContext")>(
    "../../src/runtime/runContext",
  );
  return {
    ...actual,
    markToolCallStarted,
    getRunTurn: () => 1,
  };
});
vi.mock("../../src/runtime/runEmit", () => ({
  getRunEmitter: () => () => {},
}));
vi.mock("../../src/trace/emit", () => ({
  agentStartSpan: () => "span",
  agentEndSpan: () => {},
}));

import { tools } from "../../src/graph/nodes/tools";
import type { GraphState } from "../../src/graph/types";

afterEach(() => {
  runTool.mockReset();
  seedFailedBackgroundTask.mockReset();
  markToolCallStarted.mockReset();
  markToolCallStarted.mockImplementation(async () => {});
});

function baseState(over: Partial<GraphState>): GraphState {
  return {
    message: "m",
    messages: [],
    reply: "",
    pendingToolCalls: [],
    startedToolCallIds: [],
    step: 1,
    ...over,
  };
}

function cfg() {
  return { signal: new AbortController().signal };
}

describe("tools 节点 resume", () => {
  it("已有 tool 结果 → 不 runTool，pending 缩短", async () => {
    const call = {
      id: "c1",
      type: "function" as const,
      function: { name: "read_file", arguments: '{"path":"a.ts"}' },
    };
    const state = baseState({
      messages: [{ role: "tool", tool_call_id: "c1", content: "[tool:read_file ok]\nok" }],
      pendingToolCalls: [call],
      startedToolCallIds: ["c1"],
    });
    const patch = await tools(state, cfg());
    assert.equal(runTool.mock.calls.length, 0);
    assert.equal(markToolCallStarted.mock.calls.length, 0);
    assert.deepEqual(patch.pendingToolCalls, []);
    // reuse：不追加 messages（由 Annotation reducer 保留原历史）
    assert.equal(patch.messages, undefined);
  });

  it("已开工无结果 → interrupt，不 runTool，种 Task 孤儿", async () => {
    const call = {
      id: "c2",
      type: "function" as const,
      function: {
        name: "Task",
        arguments: JSON.stringify({ subagent: "coder", prompt: "x" }),
      },
    };
    const state = baseState({
      pendingToolCalls: [call],
      startedToolCallIds: ["c2"],
    });
    const patch = await tools(state, cfg());
    assert.equal(runTool.mock.calls.length, 0);
    assert.equal(seedFailedBackgroundTask.mock.calls.length, 1);
    assert.equal(patch.pendingToolCalls?.length, 0);
    assert.equal(patch.messages?.length, 1);
    assert.match(patch.messages?.[0]?.content ?? "", /Interrupted by process crash/);
  });

  it("未开工 → mark 后 runTool", async () => {
    runTool.mockResolvedValue({ ok: true, output: "hi" });
    const call = {
      id: "c3",
      type: "function" as const,
      function: { name: "time", arguments: "{}" },
    };
    const state = baseState({ pendingToolCalls: [call] });
    const patch = await tools(state, cfg());
    assert.equal(markToolCallStarted.mock.calls.length, 1);
    assert.equal(markToolCallStarted.mock.calls[0]?.[0], "c3");
    assert.equal(runTool.mock.calls.length, 1);
    assert.deepEqual(patch.startedToolCallIds, ["c3"]);
    assert.match(patch.messages?.[0]?.content ?? "", /\[tool:time ok\]/);
  });
});
