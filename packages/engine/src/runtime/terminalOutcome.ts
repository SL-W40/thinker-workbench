/**
 * 将运行时异常归类为类型化终态 code（供 AgentErrorEvent / checkpoint 策略）。
 */
import { GraphRecursionError } from "@langchain/langgraph";
import type { AgentErrorCode } from "@thinker-workbench/shared";
import { getLimit } from "../config/runtimeLimits";
import { formatErrorMessage, isCancelError } from "../model/retry";

/** 是否保留 checkpoint（取消 / 崩溃可 Resume）。 */
export function shouldKeepCheckpoint(code: AgentErrorCode): boolean {
  return code === "cancelled" || code === "crashed";
}

/**
 * 是否 LangGraph recursionLimit 触发的兜底终止（步数预算用尽）。
 * instanceof 之外按 message 兜底：跨版本 / 序列化后仍能识别。
 */
export function isRecursionLimitError(err: unknown): boolean {
  if (err instanceof GraphRecursionError) return true;
  return /recursion limit of \d+ reached/i.test(formatErrorMessage(err));
}

/**
 * 从异常推断终态 code。
 * 用户取消 → cancelled；进程/管道类 → crashed；步数预算用尽 → failed（附可读文案）；其余 → failed。
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
  if (isRecursionLimitError(err)) {
    const max = getLimit("maxAgentSteps");
    return {
      code: "failed",
      error: `Step budget reached (max ${max} execution steps). Raise "Max execution steps" in Settings to continue.`,
    };
  }
  return { code: "failed", error };
}
