/**
 * 将运行时异常归类为类型化终态 code（供 AgentErrorEvent / checkpoint 策略）。
 */
import type { AgentErrorCode } from "@thinker-workbench/shared";
import { formatErrorMessage, isCancelError } from "../model/retry";

/** 是否保留 checkpoint（取消 / 崩溃可 Resume）。 */
export function shouldKeepCheckpoint(code: AgentErrorCode): boolean {
  return code === "cancelled" || code === "crashed";
}

/**
 * 从异常推断终态 code。
 * 用户取消 → cancelled；进程/管道类 → crashed；其余 → failed。
 */
export function classifyTerminalError(err: unknown): {
  code: AgentErrorCode;
  error: string;
} {
  const error = formatErrorMessage(err);
  if (isCancelError(err) || /run cancelled/i.test(error)) {
    return { code: "cancelled", error };
  }
  if (/utilityProcess exited|ready timeout|Process exited|EPIPE|\bcrash\b/i.test(error)) {
    return { code: "crashed", error };
  }
  return { code: "failed", error };
}
