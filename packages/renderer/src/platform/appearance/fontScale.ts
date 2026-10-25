/**
 * UI 字体大小档位：写到 `html[data-tw-font-scale]`，由 CSS `zoom` 整体缩放界面。
 * （样式已全面使用 px，不能再靠根字号联动。）
 */
import {
  type AppFontScale,
  DEFAULT_APP_FONT_SCALE,
  normalizeAppFontScale,
} from "@thinker-workbench/shared";

/**
 * 将字体大小档位应用到 documentElement。
 * @returns 规范化后的档位
 */
export function applyUiFontScale(value: unknown): AppFontScale {
  const scale = normalizeAppFontScale(value, DEFAULT_APP_FONT_SCALE);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.twFontScale = scale;
  }
  return scale;
}
