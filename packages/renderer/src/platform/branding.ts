/**
 * 品牌字标 / 应用图标路径。
 *
 * - 深色主题：浅底黑标方图标（app-icon-light）
 * - 浅色主题：黑底白标方图标（app-icon）
 * 标题栏不用透明 glyph，保证在 chrome 上始终有底板对比度。
 */

/** 标题栏 / 欢迎页 / 闪屏用的品牌图。 */
export function brandGlyphSrc(colorScheme: "light" | "dark" | string | undefined): string {
  return colorScheme === "dark" ? "./brand/app-icon-light.png" : "./brand/app-icon.png";
}

/** 带圆角方底的应用图标（可选）。 */
export function brandAppIconSrc(colorScheme: "light" | "dark" | string | undefined): string {
  return colorScheme === "dark" ? "./brand/app-icon.png" : "./brand/app-icon-light.png";
}
