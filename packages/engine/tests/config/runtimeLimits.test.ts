/**
 * runtimeLimits 配置应用冒烟。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  configureRuntimeLimits,
  getMaxAgentSteps,
  getMaxSubagentSteps,
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
});
