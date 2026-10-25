/**
 * 遗留别名表：必须指向真实 token，且每个内置主题都能提供值。
 *
 * 别名指向不存在的 token 时，Less 里的 `var(--别名, 浅色兜底)` 会静默退到兜底值；
 * 浅色主题下看不出问题，深色主题下就会变成低对比度文字（曾导致 ChatMode 菜单
 * 说明文字在暗色主题下看不清）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { APPLIED_STAGE_TOKENS, listDesignThemes } from "../../src/themes/apply";
import { LEGACY_UI_ALIASES, UI_TOKEN_KEYS } from "../../src/tokens/keys";

/** 应用阶段才产生的 token（派生 / 字体对齐），各主题的 ui 表里本就没有。 */
const APPLY_ONLY_TOKENS = new Set(APPLIED_STAGE_TOKENS);

describe("LEGACY_UI_ALIASES", () => {
  it("每个别名都指向已声明的 UI token", () => {
    const known = new Set<string>(UI_TOKEN_KEYS);
    for (const [alias, source] of Object.entries(LEGACY_UI_ALIASES)) {
      assert.ok(known.has(source), `${alias} 指向未知 token ${source}`);
    }
  });

  it("次级文字色别名齐备（缺失会让深色主题退到浅色兜底灰）", () => {
    assert.equal(LEGACY_UI_ALIASES["--ink-muted"], "--tw-fg-muted");
    assert.equal(LEGACY_UI_ALIASES["--muted"], "--tw-fg-muted");
  });

  it("每个内置主题都能为全部别名提供非空值", () => {
    const themes = listDesignThemes();
    assert.ok(themes.length > 0);
    for (const theme of themes) {
      for (const [alias, source] of Object.entries(LEGACY_UI_ALIASES)) {
        if (APPLY_ONLY_TOKENS.has(source)) continue;
        const value = theme.ui[source];
        assert.equal(
          typeof value,
          "string",
          `${theme.id} 缺少 ${source}（别名 ${alias} 会退到兜底值）`,
        );
        assert.ok(value?.trim(), `${theme.id} 的 ${source} 为空（别名 ${alias} 无效）`);
      }
    }
  });

  it("深色主题的次级文字色不取浅色兜底值", () => {
    const dark = listDesignThemes().find((theme) => theme.id === "dark");
    assert.ok(dark, "应存在 dark 内置主题");
    const source = LEGACY_UI_ALIASES["--ink-muted"];
    assert.equal(source, "--tw-fg-muted");
    assert.equal(dark.ui[source], dark.ui["--tw-fg-muted"]);
    assert.notEqual(dark.ui["--tw-fg-muted"], "#6b655c", "不应回落到浅色主题的暖灰");
  });
});
