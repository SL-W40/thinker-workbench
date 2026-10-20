/**
 * run 计时锚点（engine/src/runtime/runClock.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createRunClock } from "../../src/runtime/runClock";

describe("createRunClock", () => {
  it("starts now and defaults queuedMs to 0", () => {
    const before = Date.now();
    const clock = createRunClock();
    assert.ok(clock.startedAt >= before);
    assert.equal(clock.queuedMs, 0);
  });

  it("clamps queuedMs to non-negative finite values", () => {
    assert.equal(createRunClock(500).queuedMs, 500);
    assert.equal(createRunClock(-100).queuedMs, 0);
    assert.equal(createRunClock(Number.NaN).queuedMs, 0);
    assert.equal(createRunClock(Number.POSITIVE_INFINITY).queuedMs, 0);
    assert.equal(createRunClock(undefined).queuedMs, 0);
  });
});
