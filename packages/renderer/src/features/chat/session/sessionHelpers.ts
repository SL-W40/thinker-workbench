/**
 * 会话编排层的公共判断与阈值：纯函数，不持有状态。
 * 拆自 useChatSession —— 续跑空壳气泡判定、runStatus 到 Resume 种类的映射、待办落库防抖时长。
 */

import type { ChatMessage } from "@thinker-workbench/shared";
export const TODOS_PERSIST_DELAY_MS = 400;

/** 续跑前可丢掉的空壳错误助手气泡。 */
export function isResumeStubMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.text?.trim()) return false;
  const steps = message.timeline ?? [];
  return steps.length > 0 && steps.every((s) => s.kind === "error");
}

/** 从会话 runStatus 推导 Resume 种类*/
export function resumeKindFromRunStatus(
  runStatus: string | undefined,
): null | "cancelled" | "crashed" {
  if (runStatus === "crashed") return "crashed";
  if (runStatus === "cancelled") return "cancelled";
  return null;
}
