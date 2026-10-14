/**
 * 浮层定位：下方优先、空间不足翻到上方、左右钳制、子菜单左右翻转。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { placeBeside, placePopover } from "../../src/overlay/place";

const viewport = { width: 800, height: 600 };

describe("placePopover", () => {
  it("prefers below the anchor when there is room", () => {
    const placed = placePopover({
      anchor: { left: 100, top: 100, width: 120, height: 32 },
      size: { width: 160, height: 80 },
      viewport,
    });
    assert.equal(placed.placement, "bottom");
    assert.equal(placed.left, 100);
    assert.equal(placed.top, 136);
    assert.equal(placed.maxHeight, 320);
  });

  it("flips above when the space below is tighter", () => {
    const placed = placePopover({
      anchor: { left: 100, top: 560, width: 40, height: 32 },
      size: { width: 160, height: 80 },
      viewport,
    });
    assert.equal(placed.placement, "top");
    assert.equal(placed.top, 476);
  });

  it("stays attached when the anchor sits above the viewport", () => {
    const placed = placePopover({
      anchor: { left: 100, top: -228, width: 120, height: 36 },
      size: { width: 160, height: 80 },
      viewport,
    });
    assert.equal(placed.placement, "bottom");
    assert.equal(placed.top, -188);
  });

  it("keeps a top-placed panel against the anchor", () => {
    const placed = placePopover({
      anchor: { left: 40, top: 120, width: 80, height: 32 },
      size: { width: 160, height: 400 },
      viewport,
      placement: "top",
    });
    assert.equal(placed.placement, "top");
    const used = Math.min(400, placed.maxHeight);
    assert.equal(placed.top + used, 116);
  });

  it("clamps the left edge and honors end alignment", () => {
    const clamped = placePopover({
      anchor: { left: 780, top: 40, width: 40, height: 28 },
      size: { width: 200, height: 40 },
      viewport,
    });
    assert.equal(clamped.left, 592);

    const end = placePopover({
      anchor: { left: 100, top: 40, width: 120, height: 28 },
      size: { width: 80, height: 40 },
      viewport,
      align: "end",
    });
    assert.equal(end.left, 140);
  });
});

describe("placeBeside", () => {
  it("opens to the right of the anchor", () => {
    const placed = placeBeside({
      anchor: { left: 100, top: 40, width: 80, height: 28 },
      size: { width: 160, height: 100 },
      viewport,
    });
    assert.equal(placed.side, "right");
    assert.equal(placed.left, 184);
    assert.equal(placed.top, 40);
  });

  it("flips to the left when the right edge is blocked", () => {
    const placed = placeBeside({
      anchor: { left: 700, top: 40, width: 80, height: 28 },
      size: { width: 160, height: 100 },
      viewport,
    });
    assert.equal(placed.side, "left");
    assert.equal(placed.left, 536);
  });

  it("stays beside an anchor that is scrolled below the viewport", () => {
    const placed = placeBeside({
      anchor: { left: 56, top: 2759, width: 167, height: 32 },
      size: { width: 180, height: 45 },
      viewport: { width: 811, height: 583 },
    });
    assert.equal(placed.top, 2759);
    assert.equal(placed.left, 227);
  });

  it("shifts up when the anchor is on screen but the panel would overflow", () => {
    const placed = placeBeside({
      anchor: { left: 100, top: 540, width: 80, height: 28 },
      size: { width: 160, height: 120 },
      viewport,
    });
    assert.equal(placed.top, 472);
    assert.ok(placed.top + Math.min(120, placed.maxHeight) <= viewport.height - 8);
  });
});
