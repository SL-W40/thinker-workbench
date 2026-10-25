/**
 * UI 字体大小档位：写入 html dataset。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { applyUiFontScale } from "../../../src/platform/appearance/fontScale";

describe("applyUiFontScale", () => {
  afterEach(() => {
    delete document.documentElement.dataset.twFontScale;
  });

  it("写入规范化后的 data-tw-font-scale", () => {
    assert.equal(applyUiFontScale("large"), "large");
    assert.equal(document.documentElement.dataset.twFontScale, "large");
  });

  it("非法值回落 medium", () => {
    assert.equal(applyUiFontScale("xl"), "medium");
    assert.equal(document.documentElement.dataset.twFontScale, "medium");
  });
});
