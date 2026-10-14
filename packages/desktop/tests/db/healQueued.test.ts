/**
 * 残留 queued 的愈合策略。
 * 不打开 chat.db：当前 better-sqlite3 是按 Electron 编译的，Vitest 的 Node 加载不了。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { planQueuedHeal, QUEUE_CLEARED_ON_RESTART } from "../../src/db/queuedHeal";

describe("planQueuedHeal", () => {
  it("默认把残留 queued 收成 failed，且不能 Resume", () => {
    const plan = planQueuedHeal(false);
    assert.equal(plan.action, "fail");
    if (plan.action !== "fail") return;
    assert.equal(plan.runStatus, "failed");
    assert.equal(plan.interruptReason, QUEUE_CLEARED_ON_RESTART);
    assert.equal(plan.message, QUEUE_CLEARED_ON_RESTART);
    assert.match(plan.message, /app restarted/);
  });

  it("utility 闪退且队列仍在内存时保留 queued", () => {
    assert.deepEqual(planQueuedHeal(true), { action: "keep" });
  });
});
