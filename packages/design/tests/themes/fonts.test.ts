/**
 * design 主题的正文字体必须直接复用 markdown 的 SANS_STACK，
 * 否则 UI 与文档正文会在同一屏里落到不同字体上。
 */
import assert from "node:assert/strict";
import { SANS_STACK } from "@thinker-workbench/markdown";
import { describe, it } from "vitest";
import { auroraTheme } from "../../src/themes/aurora";
import { darkTheme } from "../../src/themes/dark";
import { eyecareTheme } from "../../src/themes/eyecare";
import { lightTheme } from "../../src/themes/light";
import { notesTheme } from "../../src/themes/notes";

describe("design 主题字体", () => {
  it("每个内置主题的 --tw-font-body 都等于 SANS_STACK", () => {
    for (const theme of [lightTheme, darkTheme, notesTheme, eyecareTheme, auroraTheme]) {
      assert.equal(theme.ui["--tw-font-body"], SANS_STACK, theme.id);
    }
  });

  it("等宽栈取自带变量（即 markdown 的 --md-font-mono）", () => {
    for (const theme of [lightTheme, darkTheme, notesTheme, eyecareTheme, auroraTheme]) {
      const mono = theme.ui["--tw-font-mono"];
      assert.equal(typeof mono, "string", theme.id);
      assert.match(mono ?? "", /monospace$/);
    }
  });
});
