/**
 * 设计主题聚合导出：内置色板与 apply。
 */

export {
  type ApplyThemeOptions,
  applyDesignTheme,
  createDesignTheme,
  listDesignThemes,
  resolveDesignTheme,
  toMarkdownTheme,
} from "./apply";
export { auroraTheme } from "./aurora";
export { darkTheme } from "./dark";
export { eyecareTheme } from "./eyecare";
export { lightTheme } from "./light";
export { notesTheme } from "./notes";
export {
  type CustomThemeLike,
  resolveUiTheme,
  windowBgFromTheme,
} from "./resolveUiTheme";
export type { DesignTheme, DesignThemeId, DesignThemeInput } from "./types";
