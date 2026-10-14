/**
 * 浏览器锁定蒙层：自定义主题用自身色板，不回落到 light。
 */
import assert from "node:assert/strict";
import type { CustomThemeRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { overlayTokensForVisual } from "../../src/browser/overlayHtml";

function custom(colorScheme: "light" | "dark"): CustomThemeRecord {
  return {
    id: "custom_ink",
    name: "Ink",
    theme: {
      id: "custom_ink",
      colorScheme,
      ui: {
        "--tw-bg": "#123456",
        "--tw-fg": "#abcdef",
      },
      markdown: {},
      mermaid: {},
    },
  };
}

describe("overlayTokensForVisual", () => {
  it("自定义主题读取 --tw-bg / --tw-fg", () => {
    const tokens = overlayTokensForVisual("custom_ink", [custom("dark")]);
    assert.equal(tokens.bg, "#123456");
    assert.equal(tokens.fg, "#abcdef");
  });

  it("缺键按 colorScheme 取深色，而不是 light", () => {
    const tokens = overlayTokensForVisual("custom_ink", [custom("dark")]);
    const dark = overlayTokensForVisual("dark");
    const light = overlayTokensForVisual("light");
    assert.equal(tokens.bgElev, dark.bgElev);
    assert.notEqual(tokens.bgElev, light.bgElev);
  });
});
