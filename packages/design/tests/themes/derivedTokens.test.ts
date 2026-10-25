/**
 * 次级 token 派生：主题未提供时由前景色生成，已提供时不覆盖。
 *
 * 这些 token 曾长期缺失，Less 只能退到 `var(--x, 兜底)` 的兜底值，
 * 使弱化表面、弱化边框、成功色在深浅主题下表现不一致。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  APPLIED_STAGE_TOKENS,
  applyDesignTheme,
  createDesignTheme,
  listDesignThemes,
} from "../../src/themes/apply";
import { darkTheme } from "../../src/themes/dark";
import { UI_TOKEN_KEYS } from "../../src/tokens/keys";

describe("applyDesignTheme 次级 token 派生", () => {
  it("主题未提供时按前景色派生弱化表面", () => {
    const el = document.createElement("div");
    applyDesignTheme("light", { target: el });
    assert.equal(
      el.style.getPropertyValue("--tw-bg-subtle"),
      "color-mix(in srgb, #111111 4%, transparent)",
    );
    assert.equal(el.style.getPropertyValue("--tw-panel-solid"), "#f7f7f7");
  });

  it("深色主题派生自浅前景，成功色取亮一档", () => {
    const el = document.createElement("div");
    applyDesignTheme(darkTheme, { target: el });
    assert.match(el.style.getPropertyValue("--tw-bg-subtle"), /^color-mix\(in srgb, #f2f2f2 /);
    assert.equal(el.style.getPropertyValue("--tw-success"), "#3fb950");
  });

  it("主题显式提供时不覆盖", () => {
    const el = document.createElement("div");
    const custom = createDesignTheme("light", { ui: { "--tw-bg-subtle": "red" } });
    applyDesignTheme(custom, { target: el });
    assert.equal(el.style.getPropertyValue("--tw-bg-subtle"), "red");
  });

  it("应用阶段 token 未被任何内置主题直接提供", () => {
    // 一旦某主题显式提供了，它就不再是「应用阶段产生」，应从列表移除
    for (const theme of listDesignThemes()) {
      for (const key of APPLIED_STAGE_TOKENS) {
        assert.equal(
          theme.ui[key],
          undefined,
          `${theme.id} 直接提供了 ${key}，应把它移出 APPLIED_STAGE_TOKENS`,
        );
      }
    }
  });

  it("每个内置主题应用后全部 UI token 都有值", () => {
    for (const theme of listDesignThemes()) {
      const el = document.createElement("div");
      applyDesignTheme(theme, { target: el });
      for (const key of UI_TOKEN_KEYS) {
        assert.ok(
          el.style.getPropertyValue(key),
          `${theme.id} 应用后 ${key} 仍为空（会退到 Less 兜底值）`,
        );
      }
    }
  });
});
