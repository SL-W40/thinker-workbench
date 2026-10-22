/**
 * 进行中 / 排队时禁止再提交。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { chatSubmitBlocked } from "../../../src/features/chat/chatSubmit";

describe("chatSubmitBlocked", () => {
  it("空闲可以发送", () => {
    assert.equal(chatSubmitBlocked(false, false), false);
  });

  it("正在回复或排队时不能发送", () => {
    assert.equal(chatSubmitBlocked(true, false), true);
    assert.equal(chatSubmitBlocked(false, true), true);
  });
});