/**
 * 设计主题类型：一份定义同时驱动 UI 外壳与 markdown（`--md-*`）。
 */
import type { MarkdownTheme, MarkdownThemeVars } from "@thinker-workbench/markdown";
import type { UiThemeVars } from "../tokens/keys";

export type DesignThemeId =
  | "light"
  | "dark"
  | "notes"
  | "eyecare"
  | "aurora"
  | "mono"
  | (string & {});

/**
 * 一份主题同时驱动 UI 外壳与 markdown（`--md-*`）。
 * 渲染侧把 `toMarkdownTheme(theme)` 传给 `MarkdownView`。
 */
export type DesignTheme = {
  id: DesignThemeId;
  /** 原生表单 / 滚动条 UI 配色方案；由 `applyDesignTheme` 写入。 */
  colorScheme?: "light" | "dark";
  /** 手写 / 常规字型风格（由 `applyTypeStyle` 设置）。 */
  typeStyle?: "hand" | "regular";
  ui: UiThemeVars;
  /** 与 `MarkdownTheme.vars` 同形——应用到 `.tw-md` / `:root`。 */
  markdown: MarkdownThemeVars;
  mermaid: MarkdownTheme["mermaid"];
};

export type DesignThemeInput = DesignTheme | DesignThemeId;
