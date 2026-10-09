/**
 * 应用语言区域：UI 文案与 AI 回复偏好。
 * UI 仅 `en` / `zh`；AI 另含「智能」跟随用户输入语言。
 */

/** 支持的界面语言：英语 / 中文。 */
export type AppLocale = "en" | "zh";

/** 全部合法 UI locale 列表（顺序即设置里展示顺序）。 */
export const APP_LOCALES: AppLocale[] = ["en", "zh"];

/** 默认界面语言（英语）。 */
export const DEFAULT_APP_LOCALE: AppLocale = "en";

/** 类型守卫：值是否为合法 AppLocale。 */
export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "zh";
}

/**
 * 将未知值规范为 AppLocale。
 * 非法时回退到 `fallback`（默认 `DEFAULT_APP_LOCALE`）。
 */
export function normalizeAppLocale(
  value: unknown,
  fallback: AppLocale = DEFAULT_APP_LOCALE,
): AppLocale {
  return isAppLocale(value) ? value : fallback;
}

/**
 * AI 回复语言偏好。
 * `smart`：跟随用户消息语言；`en` / `zh`：固定回复语言。
 */
export type AiLocale = "smart" | AppLocale;

/** 全部合法 AI locale 列表（顺序即设置里展示顺序）。 */
export const AI_LOCALES: AiLocale[] = ["smart", "en", "zh"];

/** 默认 AI 回复语言（智能跟随）。 */
export const DEFAULT_AI_LOCALE: AiLocale = "smart";

/** 类型守卫：值是否为合法 AiLocale。 */
export function isAiLocale(value: unknown): value is AiLocale {
  return value === "smart" || isAppLocale(value);
}

/**
 * 将未知值规范为 AiLocale。
 * 非法时回退到 `fallback`（默认 `DEFAULT_AI_LOCALE`）。
 */
export function normalizeAiLocale(
  value: unknown,
  fallback: AiLocale = DEFAULT_AI_LOCALE,
): AiLocale {
  return isAiLocale(value) ? value : fallback;
}
