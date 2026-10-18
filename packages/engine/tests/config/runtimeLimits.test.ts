/**
 * runtimeLimits：进程默认值（hello 入口）+ run 级快照解析 + getLimit 优先级。
 */
import assert from "node:assert/strict";
import { DEFAULT_MAX_AGENT_STEPS, DEFAULT_TOOL_CALL_MIN_GAP_MS } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  configureRuntimeLimits,
  getContextFilesMaxFileBytes,
  getContextFilesMaxTotalBytes,
  getDefaultShellBlockUntilMs,
  getLimit,
  getMaxAgentSteps,
  getMaxSubagentSteps,
  getMcpCallTimeoutMs,
  getMcpConnectTimeoutMs,
  getModelRetryBaseDelayMs,
  getModelRetryMaxAttempts,
  getReadFileDefaultMaxChars,
  getShellOutputCap,
  getToolCallMinGapMs,
  resolveRuntimeLimits,
} from "../../src/config/runtimeLimits";
import { buildRunContext } from "../../src/runtime/buildRunContext";
import { getRunContext, runWithContext } from "../../src/runtime/runContext";

describe("configureRuntimeLimits", () => {
  it("updates getters for provided fields", () => {
    configureRuntimeLimits({
      maxAgentSteps: 32,
      maxSubagentSteps: 40,
      shellOutputCap: 50_000,
    });
    assert.equal(getMaxAgentSteps(), 32);
    assert.equal(getMaxSubagentSteps(), 40);
    assert.equal(getShellOutputCap(), 50_000);

    // 恢复默认，避免污染其它测试
    configureRuntimeLimits({
      maxAgentSteps: DEFAULT_MAX_AGENT_STEPS,
      maxSubagentSteps: DEFAULT_MAX_AGENT_STEPS,
      shellOutputCap: 200_000,
    });
  });

  it("空补丁不改现值；出现的字段各自归一", () => {
    const before = getModelRetryMaxAttempts();
    configureRuntimeLimits(null);
    configureRuntimeLimits(undefined);
    assert.equal(getModelRetryMaxAttempts(), before);

    configureRuntimeLimits({
      modelRetryMaxAttempts: 1,
      modelRetryBaseDelayMs: 50,
      defaultShellBlockUntilMs: 1_000,
      mcpConnectTimeoutMs: 2_000,
      mcpCallTimeoutMs: 3_000,
      contextFilesMaxFileBytes: 4_000,
      contextFilesMaxTotalBytes: 8_000,
      readFileDefaultMaxChars: 100,
    });
    assert.equal(getModelRetryMaxAttempts(), 1);
    assert.equal(getModelRetryBaseDelayMs(), 50);
    assert.equal(getDefaultShellBlockUntilMs(), 1_000);
    assert.equal(getMcpConnectTimeoutMs(), 2_000);
    assert.equal(getMcpCallTimeoutMs(), 3_000);
    assert.equal(getContextFilesMaxFileBytes(), 4_000);
    assert.equal(getContextFilesMaxTotalBytes(), 8_000);
    // 低于下限时夹到 1000，而不是原样收下
    assert.equal(getReadFileDefaultMaxChars(), 1_000);

    // 复位
    configureRuntimeLimits({
      modelRetryMaxAttempts: 3,
      modelRetryBaseDelayMs: 400,
      defaultShellBlockUntilMs: 30_000,
      mcpConnectTimeoutMs: 15_000,
      mcpCallTimeoutMs: 60_000,
      contextFilesMaxFileBytes: 102_400,
      contextFilesMaxTotalBytes: 262_144,
      readFileDefaultMaxChars: 120_000,
    });
  });
});

describe("resolveRuntimeLimits", () => {
  it("空补丁返回完整快照（等于进程默认）", () => {
    const snapshot = resolveRuntimeLimits();
    assert.equal(snapshot.maxAgentSteps, getMaxAgentSteps());
    assert.equal(snapshot.maxSubagentSteps, getMaxSubagentSteps());
  });

  it("缺字段回退 baseline，不写进程默认", () => {
    const baseline = resolveRuntimeLimits({ maxAgentSteps: 42 });
    const merged = resolveRuntimeLimits({ maxSubagentSteps: 7 }, baseline);
    assert.equal(merged.maxAgentSteps, 42);
    assert.equal(merged.maxSubagentSteps, 7);
    // 进程默认未被 patch 污染
    assert.notEqual(getMaxAgentSteps(), 42);
    assert.notEqual(getMaxSubagentSteps(), 7);
  });

  it("历史旧值只 clamp、不按旧「轮次」语义放大", () => {
    assert.equal(resolveRuntimeLimits({ maxAgentSteps: 16 }).maxAgentSteps, 16);
  });
});

describe("getLimit", () => {
  it("无 run 上下文时取进程默认", () => {
    assert.equal(getLimit("maxAgentSteps"), getMaxAgentSteps());
  });

  it("run 内优先 RunContext.limits，退出后回落进程默认", async () => {
    const limits = resolveRuntimeLimits({ maxAgentSteps: 99 });
    const ctx = buildRunContext({
      runId: "r",
      threadId: "t",
      workspaceRoot: "C:\\tmp",
      emit: () => {},
      limits,
    });
    const inside = await runWithContext(ctx, () => {
      assert.equal(getRunContext()?.limits.maxAgentSteps, 99);
      return getLimit("maxAgentSteps");
    });
    assert.equal(inside, 99);
    // ALS 退出后回落进程默认
    assert.equal(getRunContext(), undefined);
    assert.equal(getLimit("maxAgentSteps"), getMaxAgentSteps());
  });
});

describe("toolCallMinGapMs", () => {
  it("默认 850+180+缓冲≈1200ms", () => {
    assert.equal(getToolCallMinGapMs(), DEFAULT_TOOL_CALL_MIN_GAP_MS);
    assert.equal(DEFAULT_TOOL_CALL_MIN_GAP_MS, 1200);
  });

  it("clamp 到 [0,10000]，越界回退默认", () => {
    assert.equal(resolveRuntimeLimits({ toolCallMinGapMs: -5 }).toolCallMinGapMs, 0);
    assert.equal(resolveRuntimeLimits({ toolCallMinGapMs: 99_999 }).toolCallMinGapMs, 10_000);
    assert.equal(
      resolveRuntimeLimits({ toolCallMinGapMs: "nope" as unknown }).toolCallMinGapMs,
      DEFAULT_TOOL_CALL_MIN_GAP_MS,
    );
  });

  it("run 内取 RunContext.limits 覆盖值，退出后回落", async () => {
    const limits = resolveRuntimeLimits({ toolCallMinGapMs: 2500 });
    const ctx = buildRunContext({
      runId: "g",
      threadId: "t",
      workspaceRoot: "C:\\tmp",
      emit: () => {},
      limits,
    });
    const inside = await runWithContext(ctx, () => getLimit("toolCallMinGapMs"));
    assert.equal(inside, 2500);
    assert.equal(getRunContext(), undefined);
    assert.equal(getLimit("toolCallMinGapMs"), DEFAULT_TOOL_CALL_MIN_GAP_MS);
  });
});
