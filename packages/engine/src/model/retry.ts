/**
 * 模型请求可重试判定与指数退避等待。
 * 网络抖动 / 429 / 5xx 可重试；鉴权、取消、业务 4xx 不重试。
 * 次数 / 基础延迟可由 Settings 经 runtimeLimits 覆盖。
 */
import { isCancelErrorMessage } from "@thinker-workbench/shared";
import { getLimit } from "../config/runtimeLimits";

export { isCancelErrorMessage };

/** Error / DOMException 等是否表示用户取消。 */
export function isCancelError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  return isCancelErrorMessage(formatErrorMessage(err));
}

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
  if (isCancelError(err)) return false;
  if (/MODEL_API_KEY_MISSING|api key is not set/i.test(msg)) return false;
  if (/OpenAI HTTP (401|403|400|404)\b/.test(msg)) return false;
  // undici：TypeError "terminated" / fetch failed + socket
  if (err instanceof TypeError) return true;
  return /terminated|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|other side closed|network|UND_ERR_/i.test(
    msg,
  );
}

/** 信号可中断的定时等待；abort 时驳回（默认「Run cancelled.」）。 */
export function sleep(ms: number, signal: AbortSignal, reason = "Run cancelled."): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(reason));
      return;
    }
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      Math.max(0, ms),
    );
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** 指数退避等待；abort 时抛出取消错误。 */
export function sleepBackoff(attempt: number, signal: AbortSignal): Promise<void> {
  // attempt 从 1 起表示第几次重试
  const base = getLimit("modelRetryBaseDelayMs") * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 120);
  return sleep(base + jitter, signal, "Chat completion cancelled.");
}
