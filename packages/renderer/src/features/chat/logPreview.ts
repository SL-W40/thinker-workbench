/** 发送日志用的正文预览截断（原 logger 包轻量替代）。 */

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
