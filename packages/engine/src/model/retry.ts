/**
 * 模型请求可重试判定与指数退避等待。
 * 网络抖动 / 429 / 5xx 可重试；鉴权、取消、业务 4xx 不重试。
 */

/** 最大尝试次数（含首次）。 */
export const MODEL_RETRY_MAX_ATTEMPTS = 3;
/** 首次重试基础延迟（ms）；之后按 2^n 指数增长。 */
export const MODEL_RETRY_BASE_DELAY_MS = 400;

/** 从 Error.cause 链拼出可读消息（undici 常把细节放在 cause）。 */
export function formatErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur instanceof Error && depth < 4) {
    const msg = cur.message?.trim();
    if (msg && !parts.includes(msg)) parts.push(msg);
    cur = (cur as Error & { cause?: unknown }).cause;
    depth += 1;
  }
  return parts.join(": ") || "Unknown error";
}

/** HTTP 状态是否值得退避重试。 */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * 网络 / 瞬时错误是否可重试。
 * 已取消或已向 UI 推送过 token 时不应再重试整请求。
 */
export function isRetryableError(err: unknown, options?: { emittedTokens?: boolean }): boolean {
  if (options?.emittedTokens) return false;
  const msg = formatErrorMessage(err);
  if (/cancel/i.test(msg)) return false;
  if (/MODEL_API_KEY_MISSING|api key is not set/i.test(msg)) return false;
  if (/OpenAI HTTP (401|403|400|404)\b/.test(msg)) return false;
  // undici：TypeError "terminated" / fetch failed + socket
  if (err instanceof TypeError) return true;
  return /terminated|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|other side closed|network|UND_ERR_/i.test(
    msg,
  );
}

/** 指数退避等待；abort 时抛出取消错误。 */
export function sleepBackoff(attempt: number, signal: AbortSignal): Promise<void> {
  // attempt 从 1 起表示第几次重试
  const base = MODEL_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 120);
  const ms = base + jitter;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Chat completion cancelled."));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Chat completion cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
