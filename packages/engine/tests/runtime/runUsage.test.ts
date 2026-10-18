/**
 * 一次 run 的用量账本与终态结算。
 * - 账本挂在 RunContext，子代理派生帧 `{...parentCtx}` 共享同一引用；
 * - 终态由 `emitTerminal` 统一下发：一次模型调用都没发生则**不带** usage（UI 展示「—」）。
 */
import assert from "node:assert/strict";
import os from "node:os";
import type { AgentEvent, ModelUsage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import type { CompiledAgentGraph } from "../../src/graph/buildGraph";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";
import { buildRunContext } from "../../src/runtime/buildRunContext";
import type { RunRequest } from "../../src/runtime/types";
import { bookUsage, createUsageLedger, settleUsage } from "../../src/runtime/usageLedger";

const OFFICIAL: ModelUsage = {
  inputTokens: 120,
  outputTokens: 30,
  cacheReadTokens: 40,
  cacheWriteTokens: 0,
  reasoningTokens: 10,
};

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

function makeRunContext() {
  return buildRunContext({
    runId: "run-1",
    threadId: "thread-1",
    workspaceRoot: os.tmpdir(),
    emit: () => {},
  });
}

async function runOnce(
  patch: Partial<RunRequest> & { runContext?: ReturnType<typeof makeRunContext> },
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
    ...patch,
  } as RunRequest);
  return events;
}

function usageOf(event: AgentEvent | undefined): ModelUsage | undefined {
  return (event as { usage?: ModelUsage } | undefined)?.usage;
}

describe("RunUsageLedger", () => {
  it("官方用量入账，标记为精确值", () => {
    const ledger = createUsageLedger();
    bookUsage(ledger, OFFICIAL, false);
    assert.deepEqual(settleUsage(ledger), { usage: OFFICIAL, estimated: false });
  });

  it("粗估入账会把整账本标记为估算", () => {
    const ledger = createUsageLedger();
    bookUsage(ledger, OFFICIAL, false);
    bookUsage(ledger, { ...OFFICIAL, inputTokens: 5 }, true);
    const settled = settleUsage(ledger);
    assert.equal(settled?.estimated, true);
    assert.equal(settled?.usage.inputTokens, 125);
  });

  it("一次模型调用都没发生 → 结算为 undefined（UI 展示「—」，不补 0）", () => {
    const ledger = createUsageLedger();
    assert.equal(settleUsage(ledger), undefined);
  });

  it("子代理帧共享同一账本引用（{...parentCtx} 浅拷贝）", () => {
    const parent = makeRunContext();
    // 子代理派生帧：只重置独立字段，usage **不得**重置
    const child = { ...parent, taskIds: new Set<string>(), hitlIds: new Set<string>() };
    bookUsage(child.usage, OFFICIAL, false);
    assert.equal(parent.usage.calls, 1, "子代理消耗必须并入父 run");
    assert.equal(settleUsage(parent.usage)?.usage.inputTokens, 120);
  });
});

describe("终态事件的用量", () => {
  it("本 run 无模型调用 → done 不带 usage", async () => {
    const events = await runOnce({});
    const done = events.find((e) => e.type === "done");
    assert.ok(done);
    assert.equal("usage" in done, false);
  });

  it("done 带上累计用量，且不含估算标记", async () => {
    const runContext = makeRunContext();
    bookUsage(runContext.usage, OFFICIAL, false);
    const events = await runOnce({ runContext });
    const done = events.find((e) => e.type === "done");
    assert.deepEqual(usageOf(done), OFFICIAL);
    assert.equal((done as { usageEstimated?: boolean }).usageEstimated, undefined);
  });

  it("含粗估成分时 done 下发 usageEstimated", async () => {
    const runContext = makeRunContext();
    bookUsage(runContext.usage, OFFICIAL, true);
    const events = await runOnce({ runContext });
    const done = events.find((e) => e.type === "done");
    assert.deepEqual(usageOf(done), OFFICIAL);
    assert.equal((done as { usageEstimated?: boolean }).usageEstimated, true);
  });

  it("error 路径同样下发已发生的用量（取消也能看到消耗）", async () => {
    const runContext = makeRunContext();
    bookUsage(runContext.usage, OFFICIAL, true);
    const events = await runOnce({ runContext }, { throwError: new Error("boom") });
    const err = events.find((e) => e.type === "error");
    assert.ok(err);
    assert.deepEqual(usageOf(err), OFFICIAL);
    assert.equal((err as { usageEstimated?: boolean }).usageEstimated, true);
  });

  it("准入即失败（无工作区根）→ 既无 durationMs 也无 usage", async () => {
    const events = await runOnce({ workspaceRoot: "  " });
    const err = events.find((e) => e.type === "error");
    assert.ok(err);
    assert.equal("usage" in err, false);
    assert.equal("durationMs" in err, false);
  });
});
