/**
 * 终态事件的耗时：engine 是唯一计算方，随 done / error 下发 durationMs。
 * 未进入执行阶段（准入即失败）则不下发，由 UI 展示「—」。
 */
import assert from "node:assert/strict";
import os from "node:os";
import type { AgentEvent } from "@thinker-workbench/shared";
import { describe, it, vi } from "vitest";
import type { CompiledAgentGraph } from "../../src/graph/buildGraph";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";
import type { RunRequest } from "../../src/runtime/types";

function stubGraph(opts: { throwError?: Error } = {}): CompiledAgentGraph {
  return {
    stream: async (_input: unknown) =>
      (async function* () {
        yield ["updates", { agent: { reply: "answer" } }] as [string, unknown];
        if (opts.throwError) throw opts.throwError;
      })(),
    getState: async () => ({ values: { reply: "answer" } }),
  } as unknown as CompiledAgentGraph;
}

async function runOnce(
  request: Partial<RunRequest>,
  opts: { throwError?: Error } = {},
): Promise<AgentEvent[]> {
  const runtime = new AgentRuntime({ graph: stubGraph(opts) });
  const events: AgentEvent[] = [];
  runtime.events.subscribe((e) => events.push(e));
  await runtime.run({
    message: "hi",
    workspaceRoot: os.tmpdir(),
    threadId: "thread-1",
    runId: "run-1",
    ...request,
  } as RunRequest);
  return events;
}

function terminal(events: AgentEvent[]): AgentEvent {
  const last = events[events.length - 1];
  assert.ok(last, "应发出终态事件");
  return last;
}

/** 终态事件上的耗时；缺省即「未知」。 */
function durationOf(event: AgentEvent): number | undefined {
  return (event as { durationMs?: number }).durationMs;
}

describe("AgentRuntime 的终态耗时", () => {
  it("done 事件带上本次 run 的墙钟耗时", async () => {
    const events = await runOnce({});
    const done = terminal(events);
    assert.equal(done.type, "done");
    assert.equal(typeof durationOf(done), "number");
    assert.equal((durationOf(done) ?? -1) >= 0, true);
  });

  it("排队时长并入终态耗时", async () => {
    const events = await runOnce({ queuedMs: 5_000 });
    const done = terminal(events);
    assert.equal(done.type, "done");
    // 执行几乎瞬时，5s 排队必须体现在总耗时里
    assert.equal((durationOf(done) ?? 0) >= 5_000, true);
  });

  it("error 事件同样带耗时（失败也要知道跑了多久）", async () => {
    const events = await runOnce({}, { throwError: new Error("boom") });
    const err = terminal(events);
    assert.equal(err.type, "error");
    assert.equal((durationOf(err) ?? -1) >= 0, true);
  });

  it("准入即失败（无工作区根）不下发 durationMs：耗时未知，UI 展示「—」", async () => {
    const events = await runOnce({ workspaceRoot: "  " });
    const err = terminal(events);
    assert.equal(err.type, "error");
    assert.equal("durationMs" in err, false);
  });

  it("准入即失败（空消息）不下发 durationMs", async () => {
    const events = await runOnce({ message: "   " });
    const err = terminal(events);
    assert.equal(err.type, "error");
    assert.equal("durationMs" in err, false);
  });

  it("取消路径也算耗时", async () => {
    vi.useFakeTimers();
    try {
      const events = await runOnce({}, { throwError: new Error("Run cancelled.") });
      const err = terminal(events);
      assert.equal(err.type, "error");
      assert.equal(typeof durationOf(err), "number");
    } finally {
      vi.useRealTimers();
    }
  });
});
