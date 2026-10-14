/**
 * runtimeLimits 配置应用冒烟。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  configureRuntimeLimits,
  getContextFilesMaxFileBytes,
  getContextFilesMaxTotalBytes,
  getDefaultShellBlockUntilMs,
  getMaxAgentSteps,
  getMaxSubagentSteps,
  getMcpCallTimeoutMs,
  getMcpConnectTimeoutMs,
  getModelRetryBaseDelayMs,
  getModelRetryMaxAttempts,
  getReadFileDefaultMaxChars,
  getShellOutputCap,
} from "../../src/config/runtimeLimits";

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
      maxAgentSteps: 16,
      maxSubagentSteps: 24,
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
  });
});
