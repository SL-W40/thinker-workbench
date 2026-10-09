/**
 * 日志 meta 预览：写入可读片段，并保留 chars / truncated，避免整行无限膨胀。
 * 是否截断由 `configureLogPreview` 控制（对齐通用设置 logTruncateLongContent）。
 */

/** 工具输出 / 参数等：短预览，防止单行日志被文件内容撑爆。 */
export const PREVIEW_TOOL_CHARS = 400;

/**
 * 对话正文 / 回复等：尽量保留全文，仅在极端长度时截断。
 * 日志详情里应能读完整回复，而不是短摘要。
 */
export const PREVIEW_BODY_CHARS = 100_000;

/** 关闭「截断长内容」时的安全上限，防止异常超大字符串拖垮日志文件。 */
const PREVIEW_HARD_MAX_CHARS = 2_000_000;

let truncateLongContent = true;

/** 按通用设置开关日志 meta 截断。 */
export function configureLogPreview(options: { truncateLongContent?: boolean }): void {
  if (typeof options.truncateLongContent === "boolean") {
    truncateLongContent = options.truncateLongContent;
  }
}

/** 当前是否对长文本做预览截断。 */
export function isLogPreviewTruncating(): boolean {
  return truncateLongContent;
}

export type TextPreview = {
  /** 截断后的文本（未超限则为原文）。 */
  text: string;
  /** 原文长度。 */
  chars: number;
  /** 是否发生截断。 */
  truncated: boolean;
};

/** 解析实际使用的字符上限（关闭截断时仅保留硬上限）。 */
function resolveMaxChars(requested: number): number {
  if (!truncateLongContent) return PREVIEW_HARD_MAX_CHARS;
  return Math.max(1, requested);
}

/** 截断长文本；默认按工具预览长度。正文请显式传 `PREVIEW_BODY_CHARS`。 */
export function previewText(text: string, maxChars = PREVIEW_TOOL_CHARS): TextPreview {
  const chars = text.length;
  const limit = resolveMaxChars(maxChars);
  if (chars <= limit) {
    return { text, chars, truncated: false };
  }
  return { text: `${text.slice(0, limit)}…`, chars, truncated: true };
}

/**
 * 生成 `{ field, fieldChars, fieldTruncated? }` 形态的 meta 片段。
 * 例如 `withTextPreview(msg, "message")` → `{ message, messageChars, … }`。
 */
export function withTextPreview(
  text: string,
  field = "message",
  maxChars = PREVIEW_TOOL_CHARS,
): Record<string, unknown> {
  const p = previewText(text, maxChars);
  return {
    [field]: p.text,
    [`${field}Chars`]: p.chars,
    ...(p.truncated ? { [`${field}Truncated`]: true } : {}),
  };
}

/**
 * 把任意值压成可写入 meta 的预览：对象 / 数组先 JSON，再按字符截断。
 */
export function withJsonPreview(
  value: unknown,
  field = "data",
  maxChars = PREVIEW_TOOL_CHARS,
): Record<string, unknown> {
  let raw: string;
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  return withTextPreview(raw, field, maxChars);
}
