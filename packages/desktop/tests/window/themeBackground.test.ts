/**
 * Windows 系统字幕按钮区：背景透明，符号色随主题，高度随字体档位。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { resolveTitleBarOverlay, TITLEBAR_HEIGHT_PX } from "../../src/window/themeBackground";

describe("resolveTitleBarOverlay", () => {
  it("按钮区透明，浅色符号用前景色", () => {
    const overlay = resolveTitleBarOverlay({ visual: "light" });
    assert.equal(overlay.color, "#00000000");
    assert.equal(overlay.symbolColor, "#111111");
    assert.equal(overlay.height, TITLEBAR_HEIGHT_PX);
  });

  it("内置深色与笔记纸只改符号色", () => {
    assert.equal(resolveTitleBarOverlay({ visual: "dark" }).color, "#00000000");
    assert.equal(resolveTitleBarOverlay({ visual: "dark" }).symbolColor, "#f2f2f2");
    assert.equal(resolveTitleBarOverlay({ visual: "notes" }).symbolColor, "#2a2218");
    assert.equal(resolveTitleBarOverlay({ visual: "eyecare" }).symbolColor, "#2f3a2c");
    assert.equal(resolveTitleBarOverlay({ visual: "aurora" }).symbolColor, "#e8f4f2");
  });

  it("自定义主题符号色读前景，背景仍透明", () => {
    const overlay = resolveTitleBarOverlay({
      visual: "custom_ink",
      colorScheme: "light",
      ui: {
        "--tw-bg": "#ffffff",
        "--tw-fg": "#112233",
      },
    });
    assert.equal(overlay.color, "#00000000");
    assert.equal(overlay.symbolColor, "#112233");
  });

  it("自定义主题缺前景色时按深浅回落", () => {
    const light = resolveTitleBarOverlay({
      visual: "custom_plain",
      colorScheme: "light",
      ui: { "--tw-bg": "#eef2e6" },
    });
    assert.equal(light.symbolColor, "#111111");

    const dark = resolveTitleBarOverlay({
      visual: "custom_night",
      colorScheme: "dark",
      ui: { "--tw-bg": "rgb(11, 18, 32)" },
    });
    assert.equal(dark.symbolColor, "#f2f2f2");
  });

  it("按钮区高度与标题栏对齐，并按字体 zoom 取整", () => {
    assert.equal(resolveTitleBarOverlay({ visual: "light", fontScale: "large" }).height, 50);
    assert.equal(resolveTitleBarOverlay({ visual: "light", fontScale: "small" }).height, 39);
  });
});
