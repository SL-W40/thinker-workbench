/**
 * 通用设置：UI 字体缩放（zoom 倍数）规范化。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  APP_FONT_SCALE_MAX,
  APP_FONT_SCALE_MIN,
  DEFAULT_APP_FONT_SCALE,
  DEFAULT_GENERAL_SETTINGS,
  normalizeAppFontScale,
  normalizeGeneral,
} from "../../src/ipc/general";

describe("normalizeAppFontScale", () => {
  it("保留区间内的刻度", () => {
    assert.equal(normalizeAppFontScale(0.85), 0.85);
    assert.equal(normalizeAppFontScale(1), 1);
    assert.equal(normalizeAppFontScale(1.25), 1.25);
  });

  it("超出区间的值夹取到边界", () => {
    assert.equal(normalizeAppFontScale(0.1), APP_FONT_SCALE_MIN);
    assert.equal(normalizeAppFontScale(9), APP_FONT_SCALE_MAX);
  });

  it("非法值回落到默认 100%", () => {
    assert.equal(normalizeAppFontScale(undefined), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale("huge"), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale(Number.NaN), DEFAULT_APP_FONT_SCALE);
  });

  it("旧的三档枚举字符串不再被接受，回落到 100%", () => {
    assert.equal(normalizeAppFontScale("small"), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale("medium"), DEFAULT_APP_FONT_SCALE);
    assert.equal(normalizeAppFontScale("large"), DEFAULT_APP_FONT_SCALE);
  });

  it("吸附到步进刻度且不产生浮点毛刺", () => {
    assert.equal(normalizeAppFontScale(0.93), 0.95);
    assert.equal(normalizeAppFontScale(1.17), 1.15);
  });
});

describe("normalizeGeneral uiFontScale", () => {
  it("缺省字段为 100%", () => {
    const g = normalizeGeneral({});
    assert.equal(g.uiFontScale, 1);
    assert.equal(DEFAULT_GENERAL_SETTINGS.uiFontScale, 1);
  });

  it("保留合法缩放并纠正非法值", () => {
    assert.equal(normalizeGeneral({ uiFontScale: 1.1 }).uiFontScale, 1.1);
    assert.equal(normalizeGeneral({ uiFontScale: "huge" }).uiFontScale, 1);
  });
});
