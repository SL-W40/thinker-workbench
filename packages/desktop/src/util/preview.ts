/** 日志预览截断。 */

export const PREVIEW_BODY_CHARS = 100_000;

export function withTextPreview(
  value: string,
  field: string,
  maxChars = 4_000,
): Record<string, unknown> {
  if (value.length <= maxChars) {
    return { [field]: value, [`${field}Chars`]: value.length };
  }
  return {
    [field]: `${value.slice(0, maxChars)}…`,
    [`${field}Chars`]: value.length,
    [`${field}Truncated`]: true,
  };
}
