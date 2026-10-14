/**
 * 首帧外观：preload 同步设置优先，工具窗回退到 URL theme。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readBootAppearance } from "../../src/boot/readBootAppearance";

describe("readBootAppearance", () => {
  it("读同步设置里的主题和字号", () => {
    Object.assign(globalThis, {
      location: { search: "" },
      window: {
        matchMedia: () => ({ matches: false }),
        thinker: {
          settings: {
            getGeneralSync: () => ({
              uiTheme: "dark",
              uiFontScale: "large",
              customThemes: [],
            }),
          },
        },
      },
    });
    const boot = readBootAppearance();
    assert.equal(boot.themeId, "dark");
    assert.equal(boot.fontScale, "large");
    assert.equal(boot.theme.id, "dark");
  });

  it("工具窗没有同步设置时用查询串里的 theme", () => {
    Object.assign(globalThis, {
      location: { search: "?tool=1&theme=aurora" },
      window: {
        matchMedia: () => ({ matches: true }),
        thinker: {},
      },
    });
    const boot = readBootAppearance();
    assert.equal(boot.themeId, "aurora");
    assert.equal(boot.fontScale, "medium");
  });
});
