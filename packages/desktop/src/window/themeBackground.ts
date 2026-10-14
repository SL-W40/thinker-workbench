/**
 * 原生 BrowserWindow 背景色，以及 Windows 系统字幕按钮的符号色。
 *
 * 窗口填充色用于渲染进程启动前垫底。按钮区背景设为透明，让标题栏自己的底色和底边透出来；
 * 最小化 / 最大化 / 关闭的符号色仍跟主题前景。
 */

import type {
  AppFontScale,
  AppThemeId,
  AppVisualThemeId,
  CustomThemeRecord,
} from "@thinker-workbench/shared";
import {
  DEFAULT_APP_FONT_SCALE,
  DEFAULT_APP_THEME,
  isCustomThemeId,
  normalizeAppFontScale,
  resolveVisualThemeId,
} from "@thinker-workbench/shared";
import { nativeTheme } from "electron";
import { getGeneralSettings } from "../config/settingsStore";

/** 与渲染进程 `.titlebar` 的 min-height 对齐。 */
export const TITLEBAR_HEIGHT_PX = 44;

/** 系统按钮区不铺色，标题栏背景直接透出。`#RRGGBBAA`。 */
const CAPTION_TRANSPARENT = "#00000000";

/** 字体档位对应的 CSS zoom（见 renderer `html[data-tw-font-scale]`）。 */
const FONT_ZOOM: Record<AppFontScale, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
};

/** 各内置视觉主题对应的原生窗口填充色。 */
const WINDOW_BG: Record<AppVisualThemeId, string> = {
  light: "#ffffff",
  dark: "#111111",
  notes: "#f4ebe0",
  eyecare: "#eef2e6",
  aurora: "#0b1220",
};

/** 内置主题字幕按钮符号色（设计主题 `--tw-fg`）。 */
const TITLEBAR_SYMBOL: Record<AppVisualThemeId, string> = {
  light: "#111111",
  dark: "#f2f2f2",
  notes: "#2a2218",
  eyecare: "#2f3a2c",
  aurora: "#e8f4f2",
};

/** Windows `titleBarOverlay`。背景透明，只改符号色和高度。 */
export type TitleBarOverlayPaint = {
  /** 按钮区背景，固定全透明。 */
  color: string;
  /** 最小化 / 最大化 / 关闭符号色，`#rrggbb`。 */
  symbolColor: string;
  /** 按钮区高度（DIP），与标题栏对齐，并随界面字体档位缩放。 */
  height: number;
};

type Rgba = { r: number; g: number; b: number; a: number };

function parseCssColor(input: string): Rgba | null {
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    let h = hex[1] ?? "";
    if (h.length === 3)
      h = h
        .split("")
        .map((ch) => ch + ch)
        .join("");
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    s,
  );
  if (!rgb) return null;
  const r = Number(rgb[1]);
  const g = Number(rgb[2]);
  const b = Number(rgb[3]);
  const a = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

function toHex(c: Rgba): string {
  const n = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${n(c.r)}${n(c.g)}${n(c.b)}`;
}

function symbolOrFallback(
  symbol: string | undefined,
  base: string,
  scheme: "light" | "dark",
): string {
  const parsed = symbol ? parseCssColor(symbol) : null;
  if (parsed) return toHex(parsed);
  if (scheme === "dark") return TITLEBAR_SYMBOL.dark;
  const bg = parseCssColor(base);
  if (!bg) return TITLEBAR_SYMBOL.light;
  const luminance = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
  return luminance < 0.5 ? TITLEBAR_SYMBOL.dark : TITLEBAR_SYMBOL.light;
}

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

/**
 * 按已解析的视觉主题计算 Windows 字幕按钮区。
 * 背景始终透明；不读设置、不访问 Electron，便于单测。
 */
export function resolveTitleBarOverlay(args: {
  visual: string;
  ui?: Record<string, string> | null;
  colorScheme?: "light" | "dark";
  fontScale?: AppFontScale;
}): TitleBarOverlayPaint {
  const fontScale = normalizeAppFontScale(args.fontScale, DEFAULT_APP_FONT_SCALE);
  const height = Math.max(1, Math.round(TITLEBAR_HEIGHT_PX * FONT_ZOOM[fontScale]));
  const builtin = TITLEBAR_SYMBOL[args.visual as AppVisualThemeId];
  if (builtin) {
    return { color: CAPTION_TRANSPARENT, symbolColor: builtin, height };
  }
  const ui = args.ui ?? {};
  const scheme = args.colorScheme === "dark" ? "dark" : "light";
  const base = ui["--tw-bg"]?.trim() || WINDOW_BG[scheme];
  return {
    color: CAPTION_TRANSPARENT,
    symbolColor: symbolOrFallback(ui["--tw-fg"], base, scheme),
    height,
  };
}

/**
 * 当前设置下的 Windows 字幕按钮区。
 * 背景透明；符号色随主题，`system` 跟随 OS 深浅色。
 */
export function titleBarOverlayForTheme(
  theme?: AppThemeId,
  customs?: readonly CustomThemeRecord[],
): TitleBarOverlayPaint {
  const general = getGeneralSettings();
  const id = theme ?? general.uiTheme ?? DEFAULT_APP_THEME;
  const list = customs ?? general.customThemes;
  const visual = resolveVisualThemeId(id, nativeTheme.shouldUseDarkColors);
  const record = isCustomThemeId(visual) ? list.find((t) => t.id === visual) : undefined;
  return resolveTitleBarOverlay({
    visual,
    ui: record?.theme.ui,
    colorScheme: record?.theme.colorScheme,
    fontScale: general.uiFontScale,
  });
}
