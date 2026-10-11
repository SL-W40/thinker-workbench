/**
 * 通用设置：UI 字体大小档位规范化。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_APP_FONT_SCALE,
  DEFAULT_GENERAL_SETTINGS,
  normalizeAppFontScale,
  normalizeGeneral,
} from "../../src/ipc/general";

describe("normalizeAppFontScale", () => {
  it("接受小 / 中 / 大三档", () => {
    assert.equal(normalizeAppFontScale("small"), "small");
    assert.equal(normalizeAppFontScale("medium"), "medium");
    assert.equal(normalizeAppFontScale("large"), "large");
  });

  it("非法值回落到默认中档", () => {
    assert.equal(normalizeAppFontScale(undefined), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale("huge"), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale(1), "medium");
  });
});

describe("normalizeGeneral uiFontScale", () => {
  it("缺省字段为 medium", () => {
    const g = normalizeGeneral({});
    assert.equal(g.uiFontScale, "medium");
    assert.equal(DEFAULT_GENERAL_SETTINGS.uiFontScale, "medium");
  });

  it("保留合法档位并纠正非法值", () => {
    assert.equal(normalizeGeneral({ uiFontScale: "large" }).uiFontScale, "large");
    assert.equal(normalizeGeneral({ uiFontScale: "xl" }).uiFontScale, "medium");
  });
});
