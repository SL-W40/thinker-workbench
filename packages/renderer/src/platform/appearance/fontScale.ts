/**
 * UI 字体缩放：把 zoom 倍数直接写到 `html` 的内联 `zoom` 上，整体缩放界面。
 * （样式已全面使用 px，不能再靠根字号联动；内联样式支持任意刻度，
 *  不再需要 CSS 里按档位枚举。）
 */
import {
  type AppFontScale,
  DEFAULT_APP_FONT_SCALE,
  normalizeAppFontScale,
} from "@thinker-workbench/shared";

/**
 * 将字体缩放应用到 documentElement。
 * @returns 规范化后的缩放倍数
 */
export function applyUiFontScale(value: unknown): AppFontScale {
  const scale = normalizeAppFontScale(value, DEFAULT_APP_FONT_SCALE);
  if (typeof document !== "undefined") {
    document.documentElement.style.zoom = String(scale);
  }
  return scale;
}
