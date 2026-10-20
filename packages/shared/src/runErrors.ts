/**
 * 运行错误归类：desktop / renderer / engine 共用的单一可信源。
 * 取消文案、网络 / 瞬时错误、可重试 HTTP 状态均在此定义，避免各包各写一份正则而漂移。
 */

/** 文案是否表示用户取消或 AbortSignal（含 fetch aborted）。 */
export function isCancelErrorMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  return (
    /cancel/i.test(t) ||
    /\baborted\b/i.test(t) ||
    /^Stopped\.?$/i.test(t) ||
    /^已停止[。.]?$/.test(t)
  );
}

/**
 * 网络 / 瞬时错误匹配：undici（`terminated` / `fetch failed`）与 Node 网络栈常见文案。
 * 原在 engine `retry.ts` 与 renderer `runErrors.ts` 各写一份（顺序略有差异），现收敛于此。
 */
export const NETWORK_ERROR_PATTERN: RegExp =
  /terminated|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|other side closed|network|UND_ERR_/i;

/** 文案是否为网络 / 瞬时错误（可退避重试类）。 */
export function isTransientNetworkError(message: string): boolean {
  return NETWORK_ERROR_PATTERN.test(message.trim());
}

/** 值得退避重试的 HTTP 状态：429 限流 + 网关 5xx。 */
export const RETRYABLE_HTTP_STATUSES: readonly number[] = [429, 502, 503, 504];

/** HTTP 状态是否值得退避重试（429 与 502/503/504）。 */
export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.includes(status);
}

/** `OpenAI HTTP <可重试状态>` 文案匹配（供 renderer 归类 TRANSIENT_HTTP）。 */
export const OPENAI_TRANSIENT_HTTP_PATTERN: RegExp = new RegExp(
  `OpenAI HTTP (${RETRYABLE_HTTP_STATUSES.join("|")})\\b`,
);

/** `OpenAI HTTP <鉴权状态>` 文案匹配（供 renderer 归类 AUTH）。 */
export const OPENAI_AUTH_HTTP_PATTERN: RegExp = /OpenAI HTTP (401|403)\b/;
