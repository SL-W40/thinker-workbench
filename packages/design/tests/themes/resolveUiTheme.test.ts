/**
 * 主题解析：system、内置 id、自定义快照、未知回退。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { resolveUiTheme, windowBgFromTheme } from "../../src/themes/resolveUiTheme";

describe("resolveUiTheme", () => {
  it("system 跟随深浅色；未知 id 回退到能用的内置主题", () => {
    const dark = resolveUiTheme("system", [], true);
    const light = resolveUiTheme("system", [], false);
    assert.equal(dark.id, "dark");
    assert.equal(light.id, "light");
    const unknown = resolveUiTheme("not-a-theme");
    assert.ok(unknown.ui["--tw-bg"]);
    assert.notEqual(unknown.id, "not-a-theme");
  });

  it("命中自定义目录时深拷贝，非法 mermaid 取值回退", () => {
    const custom = {
      id: "custom_a",
      theme: {
        id: "ignored",
        colorScheme: "dark" as const,
        ui: { "--tw-bg": "#010101" },
        markdown: { fg: "#fff" },
        mermaid: { theme: "nope", look: "nope", themeVariables: { line: "#abc" } },
      },
    };
    const theme = resolveUiTheme("custom_a", [custom]);
    assert.equal(theme.id, "custom_a");
    assert.equal(theme.mermaid.theme, "neutral");
    assert.equal(theme.mermaid.look, "classic");
    assert.equal(theme.ui["--tw-bg"], "#010101");
    theme.ui["--tw-bg"] = "#000";
    assert.equal(custom.theme.ui["--tw-bg"], "#010101");
    assert.equal(windowBgFromTheme(theme), "#000");
    assert.equal(windowBgFromTheme({ ...theme, ui: {} }), "#ffffff");
  });
});
