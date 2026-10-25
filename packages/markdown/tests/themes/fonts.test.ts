/**
 * 字体栈：顺序约束（西文在前、中文在后、末尾通用族兜底）与主题接入。
 * 调整顺序时应同步 packages/renderer 的 Less 与 index.html 里的回退栈——
 * 那些落在模块加载前生效，没法直接 import 这里的常量。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { listBuiltinThemes, MONO_STACK, SANS_STACK } from "../../src/themes";

/** 取 family 在栈中的下标；未出现返回 -1。 */
function indexOf(stack: string, name: string): number {
  return stack
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .indexOf(name);
}

describe("字体栈", () => {
  it("西文排在中文之前，避免拉丁字母被中文字体接管后发虚", () => {
    const latin = ["Segoe UI Variable Text", "Segoe UI"];
    const cjk = ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI"];
    for (const name of latin) {
      for (const cjkName of cjk) {
        assert.ok(
          indexOf(SANS_STACK, name) < indexOf(SANS_STACK, cjkName),
          `${name} 应早于 ${cjkName}`,
        );
      }
    }
  });

  it("末尾以通用族兜底，且不含任何字体文件名", () => {
    assert.match(SANS_STACK, /sans-serif$/);
    assert.match(MONO_STACK, /monospace$/);
    for (const stack of [SANS_STACK, MONO_STACK]) {
      assert.doesNotMatch(stack, /\.(woff2?|ttf|otf)/i);
    }
  });

  it("内置主题的 --md-font / --md-font-mono 都取自同一份栈常量", () => {
    const themes = listBuiltinThemes();
    assert.ok(themes.length >= 2);
    for (const theme of themes) {
      assert.equal(theme.vars["--md-font"], SANS_STACK, theme.id);
      assert.equal(theme.vars["--md-font-mono"], MONO_STACK, theme.id);
    }
  });
});
