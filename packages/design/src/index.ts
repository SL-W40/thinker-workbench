/**
 * `@thinker-workbench/design` 根导出：UI token、主题定义与 apply 工具。
 * React 控件请从 `@thinker-workbench/design/react` 引入。
 */

export { disableTabFocusNav } from "./dom/disableTabFocusNav";
export type { DesignTheme, DesignThemeId, DesignThemeInput, DesignTypeStyle } from "./themes";
export {
  type ApplyThemeOptions,
  type CustomThemeLike,
  applyDesignTheme,
  applyTypeStyle,
  createDesignTheme,
  auroraTheme,
  darkTheme,
  eyecareTheme,
  lightTheme,
  listDesignThemes,
  monoTheme,
  notesTheme,
  resolveDesignTheme,
  resolveUiTheme,
  toMarkdownTheme,
  windowBgFromTheme,
} from "./themes";
export type { UiThemeVars, UiTokenKey } from "./tokens/keys";
export { LEGACY_UI_ALIASES, UI_TOKEN_KEYS } from "./tokens/keys";
