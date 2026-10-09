/**
 * UI 语义 token 键名与遗留别名表。
 * ThemeProvider / applyDesignTheme 把这些写成 CSS 变量。
 */

/** 设计体系表面与控件使用的语义 UI token。 */
export const UI_TOKEN_KEYS = [
  "--tw-bg",
  "--tw-bg-elev",
  "--tw-fg",
  "--tw-fg-muted",
  "--tw-border",
  "--tw-panel",
  "--tw-accent",
  "--tw-accent-strong",
  "--tw-accent-ink",
  "--tw-accent-soft",
  "--tw-accent-ring",
  "--tw-danger",
  "--tw-danger-bg",
  "--tw-code-bg",
  "--tw-placeholder",
  "--tw-hover",
  "--tw-font-body",
  "--tw-font-hand",
  /** 解析后的 UI 正文字体——手写栈或 body，由 `applyTypeStyle` 写入。 */
  "--tw-font-ui",
  "--tw-font-mono",
  "--tw-radius",
  "--tw-radius-control",
  "--tw-shadow-soft",
] as const;

export type UiTokenKey = (typeof UI_TOKEN_KEYS)[number];
export type UiThemeVars = Partial<Record<UiTokenKey, string>> & Record<string, string>;

/**
 * renderer 遗留别名（笔记皮肤）。ThemeProvider 会与 `--tw-*` 一并写入，
 * 便于现有 Less 继续使用 `--ink` / `--bg`。
 */
export const LEGACY_UI_ALIASES: Record<string, UiTokenKey> = {
  "--bg": "--tw-bg",
  "--bg-elev": "--tw-bg-elev",
  "--ink": "--tw-fg",
  "--muted": "--tw-fg-muted",
  "--line": "--tw-border",
  "--panel": "--tw-panel",
  "--accent": "--tw-accent",
  "--accent-strong": "--tw-accent-strong",
  "--accent-ink": "--tw-accent-ink",
  "--accent-soft": "--tw-accent-soft",
  "--accent-ring": "--tw-accent-ring",
  "--danger": "--tw-danger",
  "--code-bg": "--tw-code-bg",
  "--placeholder": "--tw-placeholder",
  "--hover-wash": "--tw-hover",
  "--font-body": "--tw-font-body",
  "--font-hand": "--tw-font-hand",
  "--mono": "--tw-font-mono",
  "--font": "--tw-font-ui",
  "--display": "--tw-font-hand",
  "--radius": "--tw-radius",
};
