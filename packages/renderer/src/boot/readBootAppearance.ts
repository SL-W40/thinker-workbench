/**
 * 启动期同步读取外观，供首帧 ThemeProvider / 闪屏与设置一致。
 *
 * 优先 preload 的 `settings.getGeneralSync`；工具嵌入（`?tool=1`）读 URL
 * `theme` / `type`；浏览器预览下走默认主题与字型。
 */
import { applyTypeStyle, resolveUiTheme, type DesignTheme } from "@thinker-workbench/design";
import {
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
  normalizeAppTypeStyle,
  normalizeUiTheme,
  type AppThemeId,
  type AppTypeStyle,
  type CustomThemeRecord,
} from "@thinker-workbench/shared";

/** 启动外观：主题 id、字型风格，以及已合成的 DesignTheme。 */
export type BootAppearance = {
  themeId: AppThemeId;
  typeStyle: AppTypeStyle;
  theme: DesignTheme;
  customThemes: CustomThemeRecord[];
};

/** 当前 OS 是否偏好深色。 */
function readPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * 同步把持久化通用设置映射为可注入 ThemeProvider 的设计主题。
 * 在 React 挂载前调用，保证首屏颜色 / 字型正确。
 */
export function readBootAppearance(): BootAppearance {
  const sync = window.thinker?.settings?.getGeneralSync?.();
  const params = new URLSearchParams(location.search);
  const fromQuery =
    params.get("tool") === "1" || params.has("theme") || params.has("type")
      ? {
          uiTheme: params.get("theme"),
          uiTypeStyle: params.get("type"),
        }
      : null;
  const customThemes = sync?.customThemes ?? [];
  const themeId = normalizeUiTheme(
    sync?.uiTheme ?? fromQuery?.uiTheme,
    customThemes,
    DEFAULT_APP_THEME,
  );
  const typeStyle = normalizeAppTypeStyle(
    sync?.uiTypeStyle ?? fromQuery?.uiTypeStyle,
    DEFAULT_APP_TYPE_STYLE,
  );
  const visual = resolveUiTheme(themeId, customThemes, readPrefersDark());
  return {
    themeId,
    typeStyle,
    customThemes,
    theme: applyTypeStyle(visual, typeStyle),
  };
}
