/**
 * utility 重启退避与是否应排程。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  AGENT_RESTART_BASE_MS,
  AGENT_RESTART_MAX_MS,
  nextAgentRestartDelayMs,
  shouldScheduleAgentRestart,
} from "../../src/utility/agentProcessRestart";

describe("nextAgentRestartDelayMs", () => {
  it("从 base 指数退避并封顶", () => {
    assert.equal(nextAgentRestartDelayMs(0), AGENT_RESTART_BASE_MS);
    assert.equal(nextAgentRestartDelayMs(1), AGENT_RESTART_BASE_MS * 2);
    assert.equal(nextAgentRestartDelayMs(2), AGENT_RESTART_BASE_MS * 4);
    assert.equal(nextAgentRestartDelayMs(100), AGENT_RESTART_MAX_MS);
  });

  it("负 attempt 按 0 处理", () => {
    assert.equal(nextAgentRestartDelayMs(-3), AGENT_RESTART_BASE_MS);
  });

  it("可覆盖 base / max", () => {
    assert.equal(nextAgentRestartDelayMs(0, { baseMs: 100, maxMs: 250 }), 100);
    assert.equal(nextAgentRestartDelayMs(3, { baseMs: 100, maxMs: 250 }), 250);
  });
});

describe("shouldScheduleAgentRestart", () => {
  it("stopped 或世代不匹配时不排程", () => {
    assert.equal(
      shouldScheduleAgentRestart({
        stopped: true,
        liveGeneration: 1,
        exitedGeneration: 1,
      }),
      false,
    );
    assert.equal(
      shouldScheduleAgentRestart({
        stopped: false,
        liveGeneration: 2,
        exitedGeneration: 1,
      }),
      false,
    );
  });

  it("存活世代匹配且未 stop 时排程", () => {
    assert.equal(
      shouldScheduleAgentRestart({
        stopped: false,
        liveGeneration: 3,
        exitedGeneration: 3,
      }),
      true,
    );
  });
});
