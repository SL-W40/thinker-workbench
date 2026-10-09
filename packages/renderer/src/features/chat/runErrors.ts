/**
 * 运行失败归类：供时间线固定格式展示（不再发 System 气泡）。
 */
import { isMissingApiKeyError } from "./systemErrors";

/** 将原始错误文案归为稳定 code（可无）。 */
export function classifyRunError(message: string): string | undefined {
  const t = message.trim();
  if (!t) return undefined;
  if (isMissingApiKeyError(t)) return "MODEL_API_KEY_MISSING";
  if (/^Stopped\.?$/i.test(t) || /^已停止[。.]?$/.test(t) || /cancel/i.test(t)) {
    return "CANCELLED";
  }
  if (/OpenAI HTTP (429|502|503|504)\b/.test(t)) return "TRANSIENT_HTTP";
  if (/OpenAI HTTP (401|403)\b/.test(t)) return "AUTH";
  if (
    /terminated|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|other side closed|UND_ERR_|network/i.test(
      t,
    )
  ) {
    return "NETWORK";
  }
  return undefined;
}
