/**
 * 取消错误识别冒烟测试。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isCancelError, isCancelErrorMessage } from "../../src/model/retry";

describe("isCancelErrorMessage", () => {
  it("matches cancel and aborted wording", () => {
    assert.equal(isCancelErrorMessage("Run cancelled."), true);
    assert.equal(isCancelErrorMessage("This operation was aborted"), true);
    assert.equal(isCancelErrorMessage("Stopped."), true);
    assert.equal(isCancelErrorMessage("network timeout"), false);
  });
});

describe("isCancelError", () => {
  it("detects AbortError by name", () => {
    const err = new Error("This operation was aborted");
    err.name = "AbortError";
    assert.equal(isCancelError(err), true);
  });
});
