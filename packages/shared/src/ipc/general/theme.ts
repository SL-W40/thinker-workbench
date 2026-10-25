import { type CustomThemeRecord, isCustomThemeId } from "../customTheme";

/**
 * 内置 UI 主题 id（写入设置的字面量）。
 * 基础：`light` / `dark` / `system`；创意：`notes` / `eyecare` / `aurora`。
 */
export const APP_THEME_IDS = ["light", "dark", "system", "notes", "eyecare", "aurora"] as const;
/** 内置主题 id（封闭联合）。 */
export type BuiltinAppThemeId = (typeof APP_THEME_IDS)[number];
/**
 * 主题偏好 id：内置、或 `custom_*` 自定义 id。
 * 内置列表仍用 `APP_THEME_IDS` / `BuiltinAppThemeId`。
 */
export type AppThemeId = BuiltinAppThemeId | (string & {});

/** 基础主题（浅 / 深 / 跟随系统）。 */
export const APP_THEME_BASE_IDS = ["light", "dark", "system"] as const;
/** 基础主题 id。 */
export type AppThemeBaseId = (typeof APP_THEME_BASE_IDS)[number];

/** 创意主题。 */
export const APP_THEME_CREATIVE_IDS = ["notes", "eyecare", "aurora"] as const;
/** 创意主题 id。 */
export type AppThemeCreativeId = (typeof APP_THEME_CREATIVE_IDS)[number];

/** 可落到内置色板的视觉主题（不含 `system`）。 */
export type AppVisualThemeId = Exclude<BuiltinAppThemeId, "system">;

/** 默认主题：基础浅色。 */
export const DEFAULT_APP_THEME: BuiltinAppThemeId = "light";

/**
 * 将偏好主题解析为可应用的色板 id。
 * `system` 跟随 `prefersDark` 映射到浅 / 深基础色板。
 */
/**
 * 将偏好主题解析为可应用的内置色板 id。
 * `system` 跟随 OS；自定义 id 原样返回（调用方再查 customThemes）。
 */
export function resolveVisualThemeId(themeId: AppThemeId, prefersDark: boolean): AppThemeId {
  if (themeId === "system") return prefersDark ? "dark" : "light";
  return themeId;
}

/** 是否为内置主题 id（含 `system`）。 */
export function isBuiltinAppTheme(value: unknown): value is BuiltinAppThemeId {
  return typeof value === "string" && (APP_THEME_IDS as readonly string[]).includes(value);
}

/** 将未知值规范为合法内置主题 id。自定义 id 不在此函数接受范围内——见 `normalizeUiTheme`。 */
export function normalizeAppTheme(
  value: unknown,
  fallback: BuiltinAppThemeId = DEFAULT_APP_THEME,
): BuiltinAppThemeId {
  if (typeof value !== "string") return fallback;
  return isBuiltinAppTheme(value) ? value : fallback;
}

/**
 * 规范选中的主题偏好：内置 ∪ 当前自定义目录内的 id。
 */
export function normalizeUiTheme(
  value: unknown,
  customThemes: readonly CustomThemeRecord[],
  fallback: AppThemeId = DEFAULT_APP_THEME,
): AppThemeId {
  if (typeof value !== "string") return fallback;
  if (isBuiltinAppTheme(value)) return value;
  if (isCustomThemeId(value) && customThemes.some((t) => t.id === value)) return value;
  return fallback;
}
