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

import { DEFAULT_TOOL_CALL_MIN_GAP_MS } from "@thinker-workbench/shared";
import { configureRuntimeLimits } from "../../src/config/runtimeLimits";
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

describe("tools 串行最小间隔", () => {
  it("上一个调用结束至今不足间隔则补足，且记录结束时间", async () => {
    let clock = 1000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      configureRuntimeLimits({ toolCallMinGapMs: 50 });
      runTool.mockResolvedValue({ ok: true, output: "hi" });
      const callA = {
        id: "a",
        type: "function" as const,
        function: { name: "time", arguments: "{}" },
      };
      const callB = {
        id: "b",
        type: "function" as const,
        function: { name: "time", arguments: "{}" },
      };

      // 首调无 lastToolEndedAt：不等待，直接执行，记录结束时间
      const p1 = await tools(baseState({ pendingToolCalls: [callA] }), cfg());
      assert.equal(runTool.mock.calls.length, 1);
      assert.equal(p1.lastToolEndedAt, 1000);

      // 次调：lastToolEndedAt 与现在相同（都 1000）→ 间隔 50ms 未到，需等待 ~50ms
      clock = 1000;
      const start = performance.now();
      await tools(baseState({ pendingToolCalls: [callB], lastToolEndedAt: 1000 }), cfg());
      const elapsed = performance.now() - start;
      assert.equal(runTool.mock.calls.length, 2);
      assert.ok(elapsed >= 40, `应等待约 50ms，实际 ${elapsed}ms`);

      // 时间已远超过间隔：下一调不等待，立即发
      clock = 1000 + 10_000;
      const before = runTool.mock.calls.length;
      const t0 = performance.now();
      await tools(baseState({ pendingToolCalls: [callA], lastToolEndedAt: 1000 }), cfg());
      assert.equal(runTool.mock.calls.length, before + 1);
      assert.ok(performance.now() - t0 < 20, "超过间隔后不应等待");
    } finally {
      nowSpy.mockRestore();
      configureRuntimeLimits({ toolCallMinGapMs: DEFAULT_TOOL_CALL_MIN_GAP_MS });
    }
  });

  it("间隔为 0 时不等待，直接连发", async () => {
    const clock = 1000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      configureRuntimeLimits({ toolCallMinGapMs: 0 });
      runTool.mockResolvedValue({ ok: true, output: "hi" });
      const callA = {
        id: "a",
        type: "function" as const,
        function: { name: "time", arguments: "{}" },
      };
      const callB = {
        id: "b",
        type: "function" as const,
        function: { name: "time", arguments: "{}" },
      };
      await tools(baseState({ pendingToolCalls: [callA] }), cfg());
      const t0 = performance.now();
      await tools(baseState({ pendingToolCalls: [callB], lastToolEndedAt: 1000 }), cfg());
      assert.equal(runTool.mock.calls.length, 2);
      assert.ok(performance.now() - t0 < 20, "间隔 0 不应等待");
    } finally {
      nowSpy.mockRestore();
      configureRuntimeLimits({ toolCallMinGapMs: DEFAULT_TOOL_CALL_MIN_GAP_MS });
    }
  });
});
