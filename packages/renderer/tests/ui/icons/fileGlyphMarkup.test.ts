/**
 * DOM 字符串版图标（icons/fileGlyph.tsx 的 fileGlyphMarkup）。
 * composer 的 mention 芯片用 innerHTML 插入，走的是这条链路。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { fileGlyphMarkup } from "../../../src/ui/icons/fileGlyph";
import { iconViewBox } from "../../../src/ui/icons/material/iconData";
import { MATERIAL_ICON_SIZE } from "../../../src/ui/icons/material/MaterialSvg";
import { iconMarkup } from "../../../src/ui/icons/material/markup";
import { resolveFileIconId } from "../../../src/ui/icons/material/resolve";

/** 还原主题标记，避免污染其它用例。 */
afterEach(() => {
  document.documentElement.removeAttribute("data-tw-theme");
  document.documentElement.style.removeProperty("color-scheme");
});

describe("fileGlyphMarkup", () => {
  it("产出可直接插入的 svg 字符串", () => {
    const markup = fileGlyphMarkup("a.ts");
    assert.ok(markup.startsWith("<svg "), `实际开头：${markup.slice(0, 40)}`);
    assert.ok(markup.endsWith("</svg>"));
    assert.ok(markup.includes('aria-hidden="true"'));
    assert.ok(markup.includes(`viewBox="${iconViewBox("typescript")}"`));
    // 尺寸由 MATERIAL_ICON_SIZE 统一给出，CSS 槽位按同一数值对齐
    assert.ok(markup.includes(`width="${MATERIAL_ICON_SIZE}"`));
    assert.ok(markup.includes(`height="${MATERIAL_ICON_SIZE}"`));
  });

  it("序列化出了真实的图元内容，不是空壳", () => {
    const markup = fileGlyphMarkup("a.ts");
    assert.match(markup, /<(path|circle|rect|polygon|g)\b/, `没有图元：${markup}`);
  });

  it("与 React 链路同一份数据：节点取自解析出的图标 id", () => {
    const markup = fileGlyphMarkup("types.d.ts");
    const id = resolveFileIconId("types.d.ts", "light");
    assert.equal(markup, iconMarkup(id));
  });

  it("主题标记切换后仍产出图标（DOM 链路同步读 documentElement）", () => {
    document.documentElement.dataset.twTheme = "dark";
    const dark = fileGlyphMarkup("pnpm-lock.yaml");
    document.documentElement.dataset.twTheme = "light";
    const light = fileGlyphMarkup("pnpm-lock.yaml");
    assert.equal(dark, iconMarkup("pnpm"));
    assert.equal(light, iconMarkup("pnpm_light"));
    assert.notEqual(dark, light);
  });
});
