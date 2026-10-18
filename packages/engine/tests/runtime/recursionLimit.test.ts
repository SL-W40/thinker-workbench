/**
 * AgentRuntime 与 LangGraph recursionLimit 的衔接：
 * - 步数预算由 RunContext.limits.maxAgentSteps 1:1 下发为 config.recursionLimit；
 * - 超预算（GraphRecursionError）时优雅收尾为 done + 已有部分回复。
 */
import assert from "node:assert/strict";
import os from "node:os";
import { GraphRecursionError } from "@langchain/langgraph";
import type { AgentEvent } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import { configureRuntimeLimits } from "../../src/config/runtimeLimits";
import type { CompiledAgentGraph } from "../../src/graph/buildGraph";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";
import type { RunRequest } from "../../src/runtime/types";

type CapturedConfig = { recursionLimit?: number };

function stubGraph(
  captured: CapturedConfig[],
  opts: { throwRecursion?: boolean } = {},
): CompiledAgentGraph {
  return {
    stream: async (_input: unknown, config: CapturedConfig) => {
      captured.push(config);
      return (async function* () {
        yield ["updates", { agent: { reply: "partial answer" } }] as [string, unknown];
        if (opts.throwRecursion) {
          throw new GraphRecursionError(
            "Recursion limit of 25 reached without hitting a stop condition.",
          );
        }
      })();
    },
    getState: async () => ({ values: { reply: "partial answer" } }),
  } as unknown as CompiledAgentGraph;
}

async function runOnce(
  captured: CapturedConfig[],
  opts: { throwRecursion?: boolean } = {},
): Promise<AgentEvent[]> {
  const runtime = new AgentRuntime({ graph: stubGraph(captured, opts) });
  const events: AgentEvent[] = [];
  runtime.events.subscribe((e) => events.push(e));
  await runtime.run({
    message: "hi",
    workspaceRoot: os.tmpdir(),
    threadId: "thread-1",
    runId: "run-1",
  } as RunRequest);
  return events;
}

describe("AgentRuntime 的 LangGraph config", () => {
  afterEach(() => {
    configureRuntimeLimits({ maxAgentSteps: 60, maxSubagentSteps: 60 });
  });

  it("recursionLimit = RunContext.limits.maxAgentSteps（1:1，无换算）", async () => {
    configureRuntimeLimits({ maxAgentSteps: 30 });
    const captured: CapturedConfig[] = [];
    await runOnce(captured);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.recursionLimit, 30);
  });

  it("recursionLimit 跟随设置里的最大执行步数", async () => {
    configureRuntimeLimits({ maxAgentSteps: 120 });
    const captured: CapturedConfig[] = [];
    await runOnce(captured);

    assert.equal(captured[0]?.recursionLimit, 120);
  });

  it("步数预算用尽（GraphRecursionError）→ done + 部分回复，而非 error", async () => {
    const captured: CapturedConfig[] = [];
    const events = await runOnce(captured, { throwRecursion: true });

    assert.equal(
      events.some((e) => e.type === "error"),
      false,
    );
    const done = events.find((e) => e.type === "done");
    assert.ok(done, "应发出 done 事件");
    assert.equal(done?.type === "done" ? done.text : "", "partial answer");
  });
});
