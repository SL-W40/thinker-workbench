/**
 * Agent 运行时限额字段的默认值与规范化。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_MAX_AGENT_STEPS,
  DEFAULT_MAX_SUBAGENT_STEPS,
  DEFAULT_MODEL_RETRY_MAX_ATTEMPTS,
  DEFAULT_SHELL_BLOCK_UNTIL_MS,
  normalizeGeneral,
  normalizeMaxAgentSteps,
  normalizeMaxSubagentSteps,
} from "../../src/ipc/general";

describe("runtime limits in GeneralSettings", () => {
  it("defaults match product constants", () => {
    const g = normalizeGeneral({});
    assert.equal(g.maxAgentSteps, DEFAULT_MAX_AGENT_STEPS);
    assert.equal(g.maxSubagentSteps, DEFAULT_MAX_SUBAGENT_STEPS);
    assert.equal(g.modelRetryMaxAttempts, DEFAULT_MODEL_RETRY_MAX_ATTEMPTS);
    assert.equal(g.defaultShellBlockUntilMs, DEFAULT_SHELL_BLOCK_UNTIL_MS);
  });

  it("clamps agent / subagent steps", () => {
    assert.equal(normalizeMaxAgentSteps(0), 1);
    assert.equal(normalizeMaxAgentSteps(999), 200);
    assert.equal(normalizeMaxSubagentSteps(32), 32);
    assert.equal(normalizeGeneral({ maxAgentSteps: 48 }).maxAgentSteps, 48);
  });
});
