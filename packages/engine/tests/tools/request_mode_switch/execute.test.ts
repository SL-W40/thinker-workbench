/**
 * request_mode_switch：参数校验、HITL 请求形状、用户同意后本 run 立即生效。
 */
import assert from "node:assert/strict";
import type { HitlRequest } from "@thinker-workbench/shared";
import { beforeEach, describe, it, vi } from "vitest";
import { type RunContext, runWithContext } from "../../../src/runtime/runContext";
import { requestModeSwitchTool } from "../../../src/tools/request_mode_switch/execute";

/** 假 HITL：记录请求，按用例给定 actionId 作答。 */
const hitl = vi.hoisted(() => ({
  actionId: "switch",
  requests: [] as HitlRequest[],
}));

vi.mock("../../../src/hitl/requestHitl", () => ({
  requestHitl: async (partial: Omit<HitlRequest, "hitlId" | "threadId" | "runId">) => {
    const request = {
      hitlId: "hitl_1",
      threadId: "th1",
      runId: "r1",
      ...partial,
    } as HitlRequest;
    hitl.requests.push(request);
    return { hitlId: "hitl_1", actionId: hitl.actionId };
  },
}));

function harness(chatMode: "plan" | "agent"): {
  run: <T>(w: () => Promise<T>) => Promise<T>;
  mode: () => string;
} {
  const ctx = {
    runId: "r1",
    threadId: "th1",
    sessionId: "s1",
    workspaceRoot: "",
    todos: [],
    planOwnsTodos: true,
    chatMode,
    emit: () => {},
  } as unknown as RunContext & { chatMode: string };
  return {
    run: <T>(work: () => Promise<T>) => runWithContext(ctx, work),
    // run 结束后 ALS 已退出，直接看 ctx 上的模式是否被改写
    mode: () => ctx.chatMode,
  };
}

function output(result: Awaited<ReturnType<typeof requestModeSwitchTool>>): string {
  return typeof result === "string" ? result : result.output;
}

function ok(result: Awaited<ReturnType<typeof requestModeSwitchTool>>): boolean | undefined {
  return typeof result === "object" ? result.ok : undefined;
}

beforeEach(() => {
  hitl.actionId = "switch";
  hitl.requests.length = 0;
});

describe("requestModeSwitchTool", () => {
  it("target 非法时业务失败，不发 HITL", async () => {
    const h = harness("plan");
    const result = await h.run(() => requestModeSwitchTool({ target: "turbo" }));
    assert.equal(ok(result), false);
    assert.match(output(result), /agent/);
    assert.equal(hitl.requests.length, 0);
  });

  it("与当前模式相同则直接拒绝，不发 HITL", async () => {
    const h = harness("plan");
    const result = await h.run(() => requestModeSwitchTool({ target: "plan" }));
    assert.equal(ok(result), false);
    assert.match(output(result), /已经是 plan/);
    assert.equal(hitl.requests.length, 0);
  });

  it("请求形状：mode_switch + 目标/当前模式 + sessionId + 两个按钮", async () => {
    const h = harness("plan");
    await h.run(() => requestModeSwitchTool({ target: "agent", reason: "要跑 shell 验证" }));
    const req = hitl.requests[0];
    assert.equal(req?.kind, "mode_switch");
    assert.equal(req?.payload.targetMode, "agent");
    assert.equal(req?.payload.currentMode, "plan");
    assert.equal(req?.payload.sessionId, "s1");
    assert.equal(req?.body, "要跑 shell 验证");
    assert.deepEqual(
      req?.actions.map((a) => a.id),
      ["switch", "stay"],
    );
  });

  it("用户同意：本 run 立即切到新模式", async () => {
    const h = harness("plan");
    const result = await h.run(() => requestModeSwitchTool({ target: "agent" }));
    assert.equal(ok(result), true);
    assert.match(output(result), /已同意切换/);
    assert.equal(h.mode(), "agent");
  });

  it("用户保持：不切换模式，返回可继续的提示", async () => {
    hitl.actionId = "stay";
    const h = harness("plan");
    const result = await h.run(() => requestModeSwitchTool({ target: "agent" }));
    assert.equal(ok(result), true);
    assert.match(output(result), /保持 plan/);
    assert.equal(h.mode(), "plan");
  });
});
