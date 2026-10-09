/**
 * 原生 BrowserWindow 背景色（按 UI 主题）。
 *
 * 用于渲染进程启动前填充，以及无边框/半透明 chrome 背后的底色。
 */
import { nativeTheme } from "electron";
import type { AppThemeId, AppVisualThemeId, CustomThemeRecord } from "@thinker-workbench/shared";
import {
  DEFAULT_APP_THEME,
  isCustomThemeId,
  resolveVisualThemeId,
} from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";

/** 各内置视觉主题对应的原生窗口填充色。 */
const WINDOW_BG: Record<AppVisualThemeId, string> = {
  light: "#ffffff",
  dark: "#111111",
  notes: "#f4ebe0",
  eyecare: "#eef2e6",
  aurora: "#0b1220",
};

/**
 * 返回指定主题的窗口背景色；`system` 跟随 OS 深浅色。
 * 自定义主题读快照 `--tw-bg`。
 * @param theme 默认当前 general.uiTheme
 * @param customs 缺省取当前设置中的 customThemes
 */
export function windowBackgroundForTheme(
  theme?: AppThemeId,
  customs?: readonly CustomThemeRecord[],
): string {
  const general = getGeneralSettings();
  const id = theme ?? general.uiTheme ?? DEFAULT_APP_THEME;
  const list = customs ?? general.customThemes;
  const visual = resolveVisualThemeId(id, nativeTheme.shouldUseDarkColors);
  if (isCustomThemeId(visual)) {
    const record = list.find((t) => t.id === visual);
    const bg = record?.theme.ui["--tw-bg"];
    if (typeof bg === "string" && bg.trim()) return bg.trim();
    return WINDOW_BG.light;
  }
  return WINDOW_BG[visual as AppVisualThemeId] ?? WINDOW_BG.light;
}
