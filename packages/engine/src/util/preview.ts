/**
 * 日志预览截断（原 @thinker-workbench/logger 的轻量替代）。
 */

export const PREVIEW_BODY_CHARS = 100_000;
export const PREVIEW_TOOL_CHARS = 4_000;

function previewText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}…`, truncated: true };
}

/** 把长文本收成可塞进 meta 的字段组。 */
export function withTextPreview(
  value: string,
  field: string,
  maxChars = PREVIEW_TOOL_CHARS,
): Record<string, unknown> {
  const { text, truncated } = previewText(value, maxChars);
  return {
    [field]: text,
    [`${field}Chars`]: value.length,
    ...(truncated ? { [`${field}Truncated`]: true } : {}),
  };
}

export function withJsonPreview(
  value: unknown,
  field: string,
  maxChars = PREVIEW_TOOL_CHARS,
): Record<string, unknown> {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  return withTextPreview(raw, field, maxChars);
}
