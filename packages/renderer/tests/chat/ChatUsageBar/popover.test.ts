/**
 * ChatUsageBar 浮层定位纯函数（popover.ts，jsdom 视口 1024×768）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  placeMoreMenu,
  placeUsagePopover,
  shortTraceId,
} from "../../../src/features/chat/ChatUsageBar/popover";

/** 函数只读 left/right/top/bottom，构造最小 DOMRect 样值。 */
function rect(o: { left: number; right: number; top: number; bottom: number }): DOMRect {
  return {
    left: o.left,
    right: o.right,
    top: o.top,
    bottom: o.bottom,
    width: o.right - o.left,
    height: o.bottom - o.top,
    x: o.left,
    y: o.top,
  } as DOMRect;
}

describe("shortTraceId", () => {
  it("takes last underscore segment, first 8 chars", () => {
    assert.equal(shortTraceId("tr_abcdef123456"), "abcdef12");
    // 无下划线：整段即末段，取前 8 位
    assert.equal(shortTraceId("nodefghijklmno"), "nodefghi");
    assert.equal(shortTraceId("short"), "short");
  });
});

describe("placeUsagePopover", () => {
  it("opens above when more space above", () => {
    const c = placeUsagePopover(rect({ left: 100, right: 200, top: 400, bottom: 420 }));
    assert.deepEqual(c, { bottom: 376, left: 100, width: 280 });
  });

  it("opens below when trigger near top", () => {
    const c = placeUsagePopover(rect({ left: 100, right: 200, top: 20, bottom: 40 }));
    assert.deepEqual(c, { top: 48, left: 100, width: 280 });
  });

  it("clamps left into viewport", () => {
    const c = placeUsagePopover(rect({ left: 900, right: 1000, top: 400, bottom: 420 }));
    assert.deepEqual(c, { bottom: 376, left: 736, width: 280 });
  });
});

describe("placeMoreMenu", () => {
  it("opens above when space and height allow", () => {
    const c = placeMoreMenu(rect({ left: 100, right: 200, top: 400, bottom: 420 }), 200, 100);
    assert.deepEqual(c, { bottom: 376, left: 100 });
  });

  it("opens below when plenty of space below", () => {
    const c = placeMoreMenu(rect({ left: 100, right: 200, top: 20, bottom: 40 }), 200, 100);
    assert.deepEqual(c, { top: 48, left: 100 });
  });

  it("still opens up when below is too short but above is bigger", () => {
    const c = placeMoreMenu(rect({ left: 100, right: 200, top: 600, bottom: 620 }), 200, 700);
    assert.deepEqual(c, { bottom: 176, left: 100 });
  });

  it("aligns right edge into viewport", () => {
    const c = placeMoreMenu(rect({ left: 1000, right: 1020, top: 400, bottom: 420 }), 200, 100);
    assert.deepEqual(c, { bottom: 376, left: 820 });
  });
});
