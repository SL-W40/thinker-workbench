import {
  lightTheme,
  darkTheme,
  notesTheme,
  eyecareTheme,
  auroraTheme,
  applyTypeStyle,
  type DesignTheme,
} from "@thinker-workbench/design";
import {
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
  normalizeAppTheme,
  normalizeAppTypeStyle,
  resolveVisualThemeId,
  type AppThemeId,
  type AppTypeStyle,
} from "@thinker-workbench/shared";

function themeFromId(id: AppThemeId): DesignTheme {
  if (id === "dark") return darkTheme;
  if (id === "notes") return notesTheme;
  if (id === "eyecare") return eyecareTheme;
  if (id === "aurora") return auroraTheme;
  return lightTheme;
}

/** 当前 OS 是否偏好深色。 */
function readPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** 从 embed query 读外观；standalone 默认可写 localStorage。 */
export function readBootAppearance(): {
  theme: DesignTheme;
  themeId: AppThemeId;
  typeStyle: AppTypeStyle;
} {
  const params = new URLSearchParams(location.search);
  const embed = params.get("embed") === "1";
  const rawTheme =
    params.get("theme") || (!embed ? localStorage.getItem("tw-logs-theme") : null) || DEFAULT_APP_THEME;
  const themeId = normalizeAppTheme(rawTheme, DEFAULT_APP_THEME);
  const rawType =
    params.get("type") || (!embed ? localStorage.getItem("tw-logs-type") : null);
  const typeStyle = normalizeAppTypeStyle(rawType, DEFAULT_APP_TYPE_STYLE);
  const visual = resolveVisualThemeId(themeId, readPrefersDark());
  document.documentElement.dataset.twTheme = visual;
  document.documentElement.dataset.twType = typeStyle;
  return {
    themeId,
    typeStyle,
    theme: applyTypeStyle(themeFromId(visual), typeStyle),
  };
}

/** 宿主在同窗挂载时置位，等价于嵌入壳。 */
declare global {
  interface Window {
    __TW_EMBED_HOST__?: boolean;
  }
}

/** 是否作为嵌入壳（`?embed=1` 或宿主同窗挂载）。 */
export function isEmbed(): boolean {
  return (
    new URLSearchParams(location.search).get("embed") === "1" || Boolean(window.__TW_EMBED_HOST__)
  );
}
