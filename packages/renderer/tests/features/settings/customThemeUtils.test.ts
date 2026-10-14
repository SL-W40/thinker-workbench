/**
 * 自定义主题编辑器的颜色判断与克隆。
 */
import assert from "node:assert/strict";
import type { CustomThemeRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  cloneCustomThemeRecord,
  forkCustomTheme,
  looksLikeColor,
  toColorInputValue,
} from "../../../src/features/settings/customThemeUtils";

describe("custom theme utils", () => {
  it("认出颜色字面量，并压成 #rrggbb", () => {
    assert.equal(looksLikeColor("  #abc "), true);
    assert.equal(looksLikeColor("rgb(1, 2, 3)"), true);
    assert.equal(looksLikeColor("hsl(1,2%,3%)"), true);
    assert.equal(looksLikeColor("red"), false);
    assert.equal(toColorInputValue("#abc"), "#aabbcc");
    assert.equal(toColorInputValue("#aabbccdd"), "#aabbcc");
    assert.equal(toColorInputValue("rgb(1, 2, 300)"), "#0102ff");
    assert.equal(toColorInputValue("nope"), "#888888");
  });

  it("从内置主题分叉，克隆不共享色板对象", () => {
    const forked = forkCustomTheme({
      sourceId: "light",
      customs: [],
      prefersDark: false,
      name: "n".repeat(80),
    });
    assert.match(forked.id, /^custom_/);
    assert.equal(forked.name.length, 64);
    assert.equal(forked.basedOn, "light");
    assert.equal(forked.theme.id, forked.id);

    const record: CustomThemeRecord = forked;
    const copy = cloneCustomThemeRecord(record);
    copy.theme.ui["--tw-bg"] = "#000000";
    assert.notEqual(record.theme.ui["--tw-bg"], "#000000");
    assert.equal(copy.id, record.id);
  });
});
