/**
 * 运行失败归类：取消、进程退出、鉴权、网络，以及能否继续。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  classifyRunError,
  isProcessExitError,
  isSoftStopCode,
  softStopResumeKind,
} from "../../../src/features/chat/runErrors";

describe("classifyRunError", () => {
  it("空串没有码；取消和进程退出可以继续", () => {
    assert.equal(classifyRunError("  "), undefined);
    assert.equal(classifyRunError("Run cancelled."), "CANCELLED");
    assert.equal(classifyRunError("异常退出。"), "PROCESS_EXIT");
    assert.equal(classifyRunError("OpenAI HTTP 429"), "TRANSIENT_HTTP");
    assert.equal(classifyRunError("OpenAI HTTP 401"), "AUTH");
    assert.equal(classifyRunError("fetch failed"), "NETWORK");
    assert.equal(classifyRunError("something else"), undefined);
    assert.equal(isProcessExitError("utilityProcess exited"), true);
    assert.equal(isSoftStopCode("CANCELLED"), true);
    assert.equal(isSoftStopCode("NETWORK"), false);
    assert.equal(softStopResumeKind("Run cancelled."), "cancelled");
    assert.equal(softStopResumeKind("x", "PROCESS_EXIT"), "crashed");
    assert.equal(softStopResumeKind("nope"), null);
  });
});
