/**
 * 日志预览截断（原 `@thinker-workbench/logger` 的轻量替代）。
 *
 * 以前 desktop / engine / renderer 各有一份实现，语义相同但已经漂移；
 * 现在收敛到这里，三处共用同一套字段命名（`<field>` / `<field>Chars` / `<field>Truncated`）。
 */

/** 正文预览上限：给「看个大概」的场景（如完整请求体）用。 */
export const PREVIEW_BODY_CHARS = 100_000;
/** 工具预览上限：工具参数、事件文本这类高频字段的默认上限。 */
export const PREVIEW_TOOL_CHARS = 4_000;

function previewText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}…`, truncated: true };
}

/** 把长文本收成可塞进日志 meta 的字段组；未被截断时不带 `Truncated` 字段。 */
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

/** 同 `withTextPreview`，先把任意值序列化成 JSON 再截断（循环引用时退化为字符串）。 */
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
