import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { fitZoomFor } from "../../src/react/MermaidViewport";

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
