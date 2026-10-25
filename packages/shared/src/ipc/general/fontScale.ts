/** UI 字体大小档位（相对默认约 87.5% / 100% / 112.5%）。 */
export const APP_FONT_SCALE_IDS = ["small", "medium", "large"] as const;
/** UI 字体大小档位联合类型。 */
export type AppFontScale = (typeof APP_FONT_SCALE_IDS)[number];
/** 默认：中档。 */
export const DEFAULT_APP_FONT_SCALE: AppFontScale = "medium";

/** 将未知值规范为合法字体大小档位。 */
export function normalizeAppFontScale(
  value: unknown,
  fallback: AppFontScale = DEFAULT_APP_FONT_SCALE,
): AppFontScale {
  return typeof value === "string" && (APP_FONT_SCALE_IDS as readonly string[]).includes(value)
    ? (value as AppFontScale)
    : fallback;
}
