import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { fitZoomFor, panDeltaForAnchor } from "../../src/react/MermaidViewport";

describe("fitZoomFor（超高自动缩放）", () => {
  it("shrinks only when the diagram is taller than the cap", () => {
    assert.equal(fitZoomFor(1000, 400), 0.4);
    assert.equal(fitZoomFor(300, 400), 1);
  });

  it("never scales up, and stays 1 without a cap", () => {
    assert.equal(fitZoomFor(100, 400), 1);
    assert.equal(fitZoomFor(9000, 0), 1);
    assert.equal(fitZoomFor(0, 400), 1);
  });
});

describe("panDeltaForAnchor（以指针为中心缩放）", () => {
  // 内容点取 SVG 内 25% / 50% 处，缩放前它正落在 (150, 100)
  const anchor = { fx: 0.25, fy: 0.5, px: 150, py: 100 };
  const before = { left: 100, top: 50, width: 200, height: 100 };

  it("does not move when the anchor is already in place", () => {
    assert.deepEqual(panDeltaForAnchor(before, anchor), { dx: 0, dy: 0 });
  });

  it("pushes the anchor back after a zoom about the top-left corner", () => {
    // 放大一倍且布局原点不动：锚点漂到 (200, 150)，需反向平移 (-50, -50)
    const after = { left: 100, top: 50, width: 400, height: 200 };
    const { dx, dy } = panDeltaForAnchor(after, anchor);
    assert.deepEqual({ dx, dy }, { dx: -50, dy: -50 });
    // 补偿后锚点回到原屏幕位置：这就是「以指针为中心」
    assert.equal(after.left + dx + anchor.fx * after.width, anchor.px);
    assert.equal(after.top + dy + anchor.fy * after.height, anchor.py);
  });

  it("compensates layout shift as well when the canvas re-centers", () => {
    // 居中布局放大后原点左移，两种情况都要把锚点拉回
    const after = { left: 50, top: 0, width: 400, height: 200 };
    const { dx, dy } = panDeltaForAnchor(after, anchor);
    assert.equal(after.left + dx + anchor.fx * after.width, anchor.px);
    assert.equal(after.top + dy + anchor.fy * after.height, anchor.py);
  });
});
