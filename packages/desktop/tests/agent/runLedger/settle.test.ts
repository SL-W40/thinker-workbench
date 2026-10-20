/**
 * runLedger 终态映射（desktop/src/agent/runLedger/settle.ts）。
 * 仅覆盖纯映射；DB / Electron 广播部分受本机 ABI 限制不在此覆盖。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { outcomeToSessionStatus } from "../../../src/agent/runLedger/settle";

describe("outcomeToSessionStatus", () => {
  it("maps every outcome to a session status", () => {
    assert.equal(outcomeToSessionStatus("done"), "idle");
    assert.equal(outcomeToSessionStatus("cancelled"), "cancelled");
    assert.equal(outcomeToSessionStatus("crashed"), "crashed");
    assert.equal(outcomeToSessionStatus("failed"), "failed");
  });
});
