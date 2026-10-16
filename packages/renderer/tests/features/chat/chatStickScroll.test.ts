/**
 * 贴底判定与「仅 stuck 时滚动」。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  distanceFromBottom,
  isNearBottom,
  STICK_BOTTOM_THRESHOLD_PX,
} from "../../../src/features/chat/chatStickScroll";

function fakeEl(partial: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): HTMLElement {
  return partial as unknown as HTMLElement;
}

describe("chatStickScroll", () => {
  it("距底在阈值内视为贴底", () => {
    const el = fakeEl({ scrollHeight: 1000, scrollTop: 920, clientHeight: 80 });
    assert.equal(distanceFromBottom(el), 0);
    assert.equal(isNearBottom(el), true);
  });

  it("上翻超过阈值则非贴底", () => {
    const el = fakeEl({
      scrollHeight: 1000,
      scrollTop: 1000 - 80 - STICK_BOTTOM_THRESHOLD_PX - 1,
      clientHeight: 80,
    });
    assert.equal(isNearBottom(el), false);
  });
});
