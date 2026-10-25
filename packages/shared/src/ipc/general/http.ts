/** 模型 HTTP 兼容模式。 */
export const HTTP_COMPATIBILITY_MODES = ["http2", "http1"] as const;
export type HttpCompatibilityMode = (typeof HTTP_COMPATIBILITY_MODES)[number];
export const DEFAULT_HTTP_COMPATIBILITY_MODE: HttpCompatibilityMode = "http2";

/** 将未知值规范为合法 HTTP 兼容模式。 */
export function normalizeHttpCompatibilityMode(
  value: unknown,
  fallback: HttpCompatibilityMode = DEFAULT_HTTP_COMPATIBILITY_MODE,
): HttpCompatibilityMode {
  return typeof value === "string" &&
    (HTTP_COMPATIBILITY_MODES as readonly string[]).includes(value)
    ? (value as HttpCompatibilityMode)
    : fallback;
}
