/**
 * utility 退出时按 run 回收 PTY / browser 租约。
 */
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

const killByRunId = vi.hoisted(() => vi.fn());
const releaseBrowserLease = vi.hoisted(() => vi.fn());

vi.mock("../../src/terminal/TerminalSessionManager", () => ({
  terminalSessionManager: { killByRunId },
}));

vi.mock("../../src/agent/resourceGovernor", () => ({
  releaseBrowserLease,
}));

import { reclaimRunResources } from "../../src/utility/reclaimRunResources";

describe("reclaimRunResources", () => {
  it("对每个非空 runId 调用 killByRunId 与 releaseBrowserLease", () => {
    killByRunId.mockClear();
    releaseBrowserLease.mockClear();

    reclaimRunResources(["run-a", "  run-b  ", "", "   "]);

    assert.deepEqual(
      killByRunId.mock.calls.map((c) => c[0]),
      ["run-a", "run-b"],
    );
    assert.deepEqual(
      releaseBrowserLease.mock.calls.map((c) => c[0]),
      ["run-a", "run-b"],
    );
  });

  it("单 run 抛错不阻断后续", () => {
    killByRunId.mockClear();
    releaseBrowserLease.mockClear();
    killByRunId.mockImplementationOnce(() => {
      throw new Error("pty gone");
    });

    reclaimRunResources(["bad", "ok"]);

    assert.equal(killByRunId.mock.calls.length, 2);
    assert.deepEqual(
      releaseBrowserLease.mock.calls.map((c) => c[0]),
      ["bad", "ok"],
    );
  });
});
