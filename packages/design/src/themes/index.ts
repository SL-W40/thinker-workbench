/**
 * 设计主题聚合导出：内置色板、apply、字型风格。
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
export { applyTypeStyle, type DesignTypeStyle } from "./typeStyle";
export {
  resolveUiTheme,
  windowBgFromTheme,
  type CustomThemeLike,
} from "./resolveUiTheme";
