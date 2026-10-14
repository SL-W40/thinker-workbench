/**
 * 自定义主题：快照校验、去重截断、导入导出。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CUSTOM_THEME_FORMAT,
  type CustomThemeRecord,
  createCustomThemeId,
  isCustomThemeId,
  normalizeCustomThemeSnapshot,
  normalizeCustomThemes,
  parseCustomThemeExport,
  toCustomThemeExport,
} from "../../src/ipc/customTheme";

const theme = {
  ui: { "--tw-bg": "#111" },
  markdown: { fg: "red" },
  colorScheme: "dark" as const,
  mermaid: { theme: "dark", look: "neo", themeVariables: { line: "#fff", n: 1 } },
};

describe("custom themes", () => {
  it("id 前缀、空快照无效、颜色方案只收 light/dark", () => {
    assert.equal(isCustomThemeId("custom_abc"), true);
    assert.equal(isCustomThemeId("custom_"), false);
    assert.equal(isCustomThemeId("light"), false);
    assert.match(createCustomThemeId(), /^custom_[a-z0-9]+$/i);

    assert.equal(normalizeCustomThemeSnapshot(null, "custom_a"), null);
    assert.equal(normalizeCustomThemeSnapshot({ ui: {}, markdown: {} }, "custom_a"), null);
    const snap = normalizeCustomThemeSnapshot({ ...theme, colorScheme: "nope" }, "custom_a");
    assert.equal(snap?.id, "custom_a");
    assert.equal(snap?.colorScheme, undefined);
    assert.equal(snap?.ui["--tw-bg"], "#111");
    assert.deepEqual(snap?.mermaid.themeVariables, { line: "#fff" });
  });

  it("列表去重、丢掉非法项，并在上限处停", () => {
    const raw = [
      null,
      { id: "light", name: "no", theme },
      { id: "custom_a", name: "  A  ", basedOn: " dark ", theme },
      { id: "custom_a", name: "dup", theme },
      { id: "custom_b", theme: { ui: { a: "1" }, markdown: {} } },
    ];
    const list = normalizeCustomThemes(raw);
    assert.equal(list.length, 2);
    assert.equal(list[0]?.name, "A");
    assert.equal(list[0]?.basedOn, "dark");
    assert.equal(list[1]?.name, "custom_b");

    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `custom_${i}`,
      theme: { ui: { a: "1" }, markdown: {} },
    }));
    assert.equal(normalizeCustomThemes(many).length, 24);
    assert.deepEqual(normalizeCustomThemes({}), []);
  });

  it("导入分配新 id；格式不对或没有颜色则拒绝；导出深拷贝", () => {
    assert.equal(parseCustomThemeExport({ format: "nope", theme }), null);
    assert.equal(parseCustomThemeExport({ format: CUSTOM_THEME_FORMAT, theme: {} }), null);
    const parsed = parseCustomThemeExport({
      format: CUSTOM_THEME_FORMAT,
      name: "  Mine  ",
      basedOn: "light",
      theme,
    });
    assert.ok(parsed);
    if (!parsed) return;
    assert.equal(parsed.name, "Mine");
    assert.equal(parsed.basedOn, "light");
    assert.match(parsed.theme.id, /^custom_/);

    const record: CustomThemeRecord = {
      id: "custom_a",
      name: "A",
      basedOn: "light",
      theme: parsed.theme,
    };
    const exported = toCustomThemeExport(record);
    assert.equal(exported.format, CUSTOM_THEME_FORMAT);
    exported.theme.ui["--tw-bg"] = "#fff";
    assert.notEqual(record.theme.ui["--tw-bg"], "#fff");
  });
});
