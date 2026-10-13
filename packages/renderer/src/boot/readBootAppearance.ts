/**
 * 启动期同步读取外观，供首帧 ThemeProvider / 闪屏与设置一致。
 *
 * 优先 preload 的 `settings.getGeneralSync`；工具嵌入（`?tool=1`）读 URL
 * `theme`；浏览器预览下走默认主题。
 */
import { type DesignTheme, resolveUiTheme } from "@thinker-workbench/design";
import {
  type AppFontScale,
  type AppThemeId,
  type CustomThemeRecord,
  DEFAULT_APP_THEME,
  normalizeAppFontScale,
  normalizeUiTheme,
} from "@thinker-workbench/shared";

/** 启动外观：主题 id、字体档位以及已解析的 DesignTheme。 */
export type BootAppearance = {
  themeId: AppThemeId;
  theme: DesignTheme;
  customThemes: CustomThemeRecord[];
  fontScale: AppFontScale;
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
 * 在 React 挂载前调用，保证首屏颜色正确。
 */
export function readBootAppearance(): BootAppearance {
  const sync = window.thinker?.settings?.getGeneralSync?.();
  const params = new URLSearchParams(location.search);
  const fromQuery =
    params.get("tool") === "1" || params.has("theme")
      ? {
          uiTheme: params.get("theme"),
        }
      : null;
  const customThemes = sync?.customThemes ?? [];
  const themeId = normalizeUiTheme(
    sync?.uiTheme ?? fromQuery?.uiTheme,
    customThemes,
    DEFAULT_APP_THEME,
  );
  const dark = readPrefersDark();
  return {
    themeId,
    customThemes,
    theme: resolveUiTheme(themeId, customThemes, dark),
    fontScale: normalizeAppFontScale(sync?.uiFontScale),
  };
}
