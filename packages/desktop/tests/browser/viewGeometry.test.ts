/**
 * 浏览器视图几何与蒙层文案（desktop/src/browser/viewGeometry.ts、overlayCopy.ts）。
 * 仅覆盖纯计算；Electron 挂载 / 截图部分不在单测范围。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { overlayCopyFor } from "../../src/browser/overlayCopy";
import { captureBounds, viewBoundsFor } from "../../src/browser/viewGeometry";

const bounds = { x: 10, y: 20, width: 800, height: 600 };

describe("captureBounds", () => {
  it("uses measured size offscreen", () => {
    assert.deepEqual(captureBounds(bounds), {
      x: -10_000,
      y: -10_000,
      width: 800,
      height: 600,
    });
  });

  it("falls back to 1280x720 when unmeasured", () => {
    assert.deepEqual(captureBounds({ x: 0, y: 0, width: 0, height: 0 }), {
      x: -10_000,
      y: -10_000,
      width: 1280,
      height: 720,
    });
  });
});

describe("viewBoundsFor", () => {
  it("detaches when invisible", () => {
    const next = viewBoundsFor({
      visible: false,
      blank: false,
      locked: false,
      measured: true,
      bounds,
    });
    assert.equal(next.view, null);
    assert.deepEqual(next.overlay, { x: 0, y: 0, width: 0, height: 0 });
  });

  it("detaches on blank page unless locked", () => {
    assert.equal(
      viewBoundsFor({ visible: true, blank: true, locked: false, measured: true, bounds }).view,
      null,
    );
    assert.deepEqual(
      viewBoundsFor({ visible: true, blank: true, locked: true, measured: true, bounds }).view,
      bounds,
    );
  });

  it("uses offscreen placeholder while unmeasured", () => {
    const next = viewBoundsFor({
      visible: true,
      blank: false,
      locked: false,
      measured: false,
      bounds,
    });
    assert.deepEqual(next.view, { x: -10_000, y: -10_000, width: 1280, height: 720 });
    // 未量洞时蒙层不铺开
    assert.deepEqual(next.overlay, { x: 0, y: 0, width: 0, height: 0 });
  });

  it("spreads overlay only when locked and measured", () => {
    assert.deepEqual(
      viewBoundsFor({ visible: true, blank: false, locked: true, measured: true, bounds }).overlay,
      bounds,
    );
  });
});

describe("overlayCopyFor", () => {
  it("returns Chinese copy for zh, English otherwise", () => {
    assert.deepEqual(overlayCopyFor("zh"), { title: "AI 控制中", takeControl: "接管" });
    assert.deepEqual(overlayCopyFor("en"), {
      title: "AI is controlling",
      takeControl: "Take control",
    });
    assert.equal(overlayCopyFor(undefined).title, "AI is controlling");
    assert.equal(overlayCopyFor("jp").title, "AI is controlling");
  });
});
