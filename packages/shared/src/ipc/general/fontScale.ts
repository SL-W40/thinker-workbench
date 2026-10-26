/**
 * UI 字体缩放：以 zoom 倍数（相对 100%）直接存储，如 0.85 / 1 / 1.1。
 * 用连续刻度代替旧的三档枚举，设置页用滑块左右滑动调整。
 */
/** 最小缩放（80%）。 */
export const APP_FONT_SCALE_MIN = 0.8;
/** 最大缩放（125%）。 */
export const APP_FONT_SCALE_MAX = 1.25;
/** 刻度步进（5%），保证不同端存取一致。 */
export const APP_FONT_SCALE_STEP = 0.05;
/** 缩放类型（zoom 倍数）。 */
export type AppFontScale = number;
/** 默认：100%。 */
export const DEFAULT_APP_FONT_SCALE: AppFontScale = 1;

/** 将未知值规范到 [MIN, MAX] 内并吸附到步进刻度（规避浮点误差）。 */
export function normalizeAppFontScale(
  value: unknown,
  fallback: AppFontScale = DEFAULT_APP_FONT_SCALE,
): AppFontScale {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(APP_FONT_SCALE_MAX, Math.max(APP_FONT_SCALE_MIN, n));
  const stepped = Math.round(clamped / APP_FONT_SCALE_STEP) * APP_FONT_SCALE_STEP;
  return Math.round(stepped * 100) / 100;
}
