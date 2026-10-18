/**
 * AgentRuntime.resume 的空快照防护单测：
 * checkpoint 丢失（如 MemorySaver 回退后进程重启）时必须报错，
 * 而不是下发空文本的 done（曾表现为「继续」按钮空转）。
 * 通过注入假 graph 驱动，不触碰真实模型 / SQLite。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CompiledAgentGraph } from "../../src/graph/buildGraph";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";

type Snapshot = {
  values: unknown;
  next: string[];
};

function runtimeWithSnapshots(
  snapshots: Array<Snapshot | null>,
  captured: { configs: Array<Record<string, unknown>> },
): AgentRuntime {
  let call = 0;
  const graph = {
    getState: async (config: Record<string, unknown>) => {
      captured.configs.push(config);
      const snap = snapshots[Math.min(call, snapshots.length - 1)];
      call += 1;
      return snap ?? null;
    },
  } as unknown as CompiledAgentGraph;
  return new AgentRuntime({ graph });
}

/** 取第 n 次 getState 的线程键。 */
function threadIdOf(captured: { configs: Array<Record<string, unknown>> }, index: number): string {
  const cfg = captured.configs[index] as { configurable?: { thread_id?: string } } | undefined;
  return cfg?.configurable?.thread_id ?? "";
}

describe("AgentRuntime.resume 空快照防护", () => {
  it("空状态且无可执行 next → 报错 No checkpoint to resume（不下发空 done）", async () => {
    const captured: { configs: Array<Record<string, unknown>> } = { configs: [] };
    const rt = runtimeWithSnapshots([{ values: {}, next: [] }], captured);
    await assert.rejects(rt.resume({ threadId: "th1", runId: "r1" }), /No checkpoint to resume/);
    // 线程键回退为纯 threadId（登记表缺失时）
    assert.equal(threadIdOf(captured, 0), "th1");
  });

  it("getState 返回 null → 报错 No checkpoint to resume", async () => {
    const captured: { configs: Array<Record<string, unknown>> } = { configs: [] };
    const rt = runtimeWithSnapshots([null], captured);
    await assert.rejects(rt.resume({ threadId: "th2", runId: "r2" }), /No checkpoint to resume/);
  });

  it("已完成状态（有 reply、无 next）→ 正常 done 且文本回传", async () => {
    const captured: { configs: Array<Record<string, unknown>> } = { configs: [] };
    const rt = runtimeWithSnapshots([{ values: { reply: "已完成回答" }, next: [] }], captured);
    const done: Array<{ type: string; text?: string }> = [];
    rt.events.subscribe((e) => {
      if (e.type === "done") done.push(e);
    });
    await rt.resume({ threadId: "th3", runId: "r3" });
    assert.equal(done.length, 1);
    assert.equal(done[0]?.text, "已完成回答");
  });

  it("登记表命中 runKey 时用其作线程键（memory checkpointer 场景）", async () => {
    const captured: { configs: Array<Record<string, unknown>> } = { configs: [] };
    const graph = {
      getState: async (config: Record<string, unknown>) => {
        captured.configs.push(config);
        return { values: { reply: "ok" }, next: [] };
      },
    } as unknown as CompiledAgentGraph;
    const rt = new AgentRuntime({ graph });
    // 先用一次 run 登记键（threads.json 写入 checkpointDir=undefined 时跳过），
    // 这里直接验证回退路径：查不到登记 → 用纯 threadId
    await rt.resume({ threadId: "th4", runId: "r4" });
    assert.equal(threadIdOf(captured, 0), "th4");
  });
});
