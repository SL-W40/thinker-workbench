/**
 * 活跃 run 注册表：登记、按 id 查找（trim）、注销与计数。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { RunController } from "../../src/runtime/RunController";
import type { RunContext } from "../../src/runtime/runContext";
import {
  countActiveRuns,
  getRunHandle,
  listActiveRunIds,
  registerRun,
  unregisterRun,
} from "../../src/runtime/runRegistry";

function handle(runId: string) {
  return {
    context: { runId } as RunContext,
    controller: new RunController(runId, "thread"),
  };
}

describe("runRegistry", () => {
  afterEach(() => {
    for (const id of listActiveRunIds()) unregisterRun(id);
  });

  it("查找时去掉空白；注销后消失", () => {
    assert.equal(countActiveRuns(), 0);
    registerRun(handle("run-1"));
    assert.equal(getRunHandle("  run-1  ")?.controller.runId, "run-1");
    assert.deepEqual(listActiveRunIds(), ["run-1"]);
    assert.equal(countActiveRuns(), 1);
    unregisterRun("run-1");
    assert.equal(getRunHandle("run-1"), undefined);
    unregisterRun("missing");
  });
});
