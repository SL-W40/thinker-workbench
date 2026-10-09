/**
 * 运行失败归类：供时间线固定格式展示（不再发 System 气泡）。
 */
import { isMissingApiKeyError } from "./systemErrors";

/** 将原始错误文案归为稳定 code（可无）。 */
export function classifyRunError(message: string): string | undefined {
  const t = message.trim();
  if (!t) return undefined;
  if (isMissingApiKeyError(t)) return "MODEL_API_KEY_MISSING";
  if (
    /^Stopped\.?$/i.test(t) ||
    /^已停止[。.]?$/.test(t) ||
    /cancel/i.test(t)
  ) {
    return "CANCELLED";
  }
  // agent utilityProcess / 热重载等异常退出
  if (
    /utilityProcess exited|ready timeout|Process exited|EPIPE|\bcrash\b/i.test(t) ||
    /^异常退出[。.]?$/.test(t) ||
    /^Exited unexpectedly\.?$/i.test(t)
  ) {
    return "PROCESS_EXIT";
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

/** 可时间线「继续」的软中断（主动停止 / 进程异常退出）。 */
export function isSoftStopCode(code: string | undefined): boolean {
  return code === "CANCELLED" || code === "PROCESS_EXIT";
}

/** 是否为进程 / 桥接异常退出类错误文案。 */
export function isProcessExitError(message: string): boolean {
  return classifyRunError(message) === "PROCESS_EXIT";
}

/**
 * 软中断对应的 Resume 种类：cancelled 仅时间线；crashed 时间线 + 输入区横幅。
 */
export function softStopResumeKind(
  message: string,
  code?: string,
): null | "cancelled" | "crashed" {
  const c = code ?? classifyRunError(message);
  if (c === "CANCELLED") return "cancelled";
  if (c === "PROCESS_EXIT") return "crashed";
  return null;
}
