/**
 * 类型化终态归类。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { classifyTerminalError, shouldKeepCheckpoint } from "../../src/runtime/terminalOutcome";

describe("classifyTerminalError", () => {
  it("取消类 → cancelled 并保留 checkpoint", () => {
    const r = classifyTerminalError(new Error("Run cancelled."));
    assert.equal(r.code, "cancelled");
    assert.equal(shouldKeepCheckpoint(r.code), true);
  });

  it("AbortError → cancelled", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    assert.equal(classifyTerminalError(err).code, "cancelled");
  });

  it("进程退出类 → crashed", () => {
    const r = classifyTerminalError(new Error("Agent utilityProcess exited (1)."));
    assert.equal(r.code, "crashed");
    assert.equal(shouldKeepCheckpoint(r.code), true);
  });

  it("其它 → failed 且清 checkpoint", () => {
    const r = classifyTerminalError(new Error("MODEL_API_KEY_MISSING"));
    assert.equal(r.code, "failed");
    assert.equal(shouldKeepCheckpoint(r.code), false);
  });
});
