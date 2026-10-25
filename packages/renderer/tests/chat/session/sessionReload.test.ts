/**
 * 会话 DB 重载覆盖判定：防空快照冲掉本地气泡。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { shouldApplySessionReload } from "../../../src/features/chat/session/sessionReload";

describe("shouldApplySessionReload", () => {
  it("直播目标存在时不覆盖", () => {
    assert.equal(
      shouldApplySessionReload({
        targetMsgId: "a1",
        localCount: 2,
        dbCount: 0,
      }),
      false,
    );
  });

  it("本地有消息而 DB 为空时不覆盖（防抖落库竞态）", () => {
    assert.equal(
      shouldApplySessionReload({
        targetMsgId: null,
        localCount: 2,
        dbCount: 0,
      }),
      false,
    );
  });

  it("本地与 DB 都空时允许覆盖（保持空态）", () => {
    assert.equal(
      shouldApplySessionReload({
        targetMsgId: null,
        localCount: 0,
        dbCount: 0,
      }),
      true,
    );
  });

  it("DB 已有消息时允许覆盖", () => {
    assert.equal(
      shouldApplySessionReload({
        targetMsgId: null,
        localCount: 2,
        dbCount: 2,
      }),
      true,
    );
  });
});
