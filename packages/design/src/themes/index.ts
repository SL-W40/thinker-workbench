/**
 * 设计主题聚合导出：内置色板与 apply。
 */
export type { DesignTheme, DesignThemeId, DesignThemeInput } from "./types";
export { lightTheme } from "./light";
export { darkTheme } from "./dark";
export { notesTheme } from "./notes";
export { eyecareTheme } from "./eyecare";
export { auroraTheme } from "./aurora";
export { monoTheme } from "./mono";
export {
  applyDesignTheme,
  createDesignTheme,
  listDesignThemes,
  resolveDesignTheme,
  toMarkdownTheme,
  type ApplyThemeOptions,
} from "./apply";
export {
  resolveUiTheme,
  windowBgFromTheme,
  type CustomThemeLike,
} from "./resolveUiTheme";
