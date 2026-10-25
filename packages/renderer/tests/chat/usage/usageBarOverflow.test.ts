/**
 * 胶囊行溢出：可见个数计算。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { visiblePillCount } from "../../../src/features/chat/usage/usageBarOverflow";

describe("visiblePillCount", () => {
  it("全部放得下时返回全部", () => {
    assert.equal(visiblePillCount([40, 80, 70, 90], 400, 32, 8), 4);
  });

  it("放不下时从右侧挤进 more，并预留 more 宽度", () => {
    // 40+8+80+8+70 = 206；再加 more 32+8 → 需 246 才能留 3 颗
    assert.equal(visiblePillCount([40, 80, 70, 90], 240, 32, 8), 2);
    assert.equal(visiblePillCount([40, 80, 70, 90], 250, 32, 8), 3);
  });

  it("仅 more 放得下时可见为 0", () => {
    assert.equal(visiblePillCount([100, 100], 40, 32, 8), 0);
  });

  it("空列表为 0", () => {
    assert.equal(visiblePillCount([], 200, 32, 8), 0);
  });

  it("alwaysReserveMore：即便主行全放下也预留 more", () => {
    // 40+8+80 = 128；+8+32 more = 168。宽 160 时只能留 1 颗
    assert.equal(visiblePillCount([40, 80], 160, 32, 8, { alwaysReserveMore: true }), 1);
    assert.equal(visiblePillCount([40, 80], 200, 32, 8, { alwaysReserveMore: true }), 2);
  });
});
