import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  BUSY_MAX_WAIT_MS,
  BUSY_WAIT_MS,
  busyWaitMs,
  IDLE_WAIT_MS,
  MAX_INTERVAL_MS,
  MAX_RENDERS,
  MIN_INTERVAL_MS,
  nextRenderDelay,
} from "../../src/mermaid/streamScheduler";

const base = {
  incomplete: true,
  lastRenderMs: 120,
  arrivalGapMs: 1000,
  sinceLastRenderMs: 0,
  renderCount: 1,
  failStreak: 0,
};

describe("nextRenderDelay", () => {
  it("renders at once once the fence is closed", () => {
    assert.deepEqual(nextRenderDelay({ ...base, incomplete: false, arrivalGapMs: 20 }), {
      waitMs: 0,
      render: true,
      degrade: false,
    });
  });

  it("waits a short idle delay when the stream has paused", () => {
    const d = nextRenderDelay({
      ...base,
      arrivalGapMs: 1000,
      sinceLastRenderMs: MIN_INTERVAL_MS,
    });
    assert.equal(d.waitMs, IDLE_WAIT_MS);
    assert.equal(d.render, true);
  });

  it("stretches the wait with render cost while tokens keep arriving", () => {
    const slow = nextRenderDelay({ ...base, arrivalGapMs: 80, lastRenderMs: 300 });
    assert.equal(slow.waitMs, busyWaitMs(300));
    assert.ok(slow.waitMs > IDLE_WAIT_MS);
    // 耗时折算有上限，超慢帧不会把间隔无限拉长
    assert.equal(
      nextRenderDelay({ ...base, arrivalGapMs: 80, lastRenderMs: 5000 }).waitMs,
      BUSY_MAX_WAIT_MS,
    );
  });

  it("never starves a dense stream: overdue frames render immediately", () => {
    const d = nextRenderDelay({ ...base, arrivalGapMs: 40, sinceLastRenderMs: MAX_INTERVAL_MS });
    assert.equal(d.waitMs, 0);
    assert.equal(d.render, true);
  });

  it("holds a floor between two renders even when the stream pauses", () => {
    // 慢速流一行一停：400ms 空闲等待会让「每行一渲染」，最小间隔把它挡住
    const d = nextRenderDelay({ ...base, arrivalGapMs: 1000, sinceLastRenderMs: 200 });
    assert.equal(d.waitMs, MIN_INTERVAL_MS - 200);
    assert.ok(d.waitMs > IDLE_WAIT_MS);
  });

  it("degrades after repeated failures and only renders on close", () => {
    const degraded = nextRenderDelay({ ...base, failStreak: 3 });
    assert.equal(degraded.degrade, true);
    assert.equal(degraded.render, false);

    const closed = nextRenderDelay({ ...base, failStreak: 3, incomplete: false });
    assert.equal(closed.render, true);
  });

  it("degrades once the render budget is spent", () => {
    assert.equal(nextRenderDelay({ ...base, renderCount: MAX_RENDERS }).render, false);
    assert.equal(nextRenderDelay({ ...base, renderCount: MAX_RENDERS - 1 }).render, true);
  });
});

describe("busyWaitMs", () => {
  it("starts from the busy base and caps at the max", () => {
    assert.equal(busyWaitMs(0), BUSY_WAIT_MS);
    assert.equal(busyWaitMs(100000), BUSY_MAX_WAIT_MS);
  });
});
