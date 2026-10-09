/**
 * 会话转录辅助：不可变地追加一条消息。
 * 图节点当前多直接展开数组；本函数留给需要规范化历史时复用。
 */
import type { ChatMessage } from "@thinker-workbench/shared";

/** 返回带新消息的历史副本（供图节点可见的规范化历史）。 */
export function appendMessage(history: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return [...history, message];
}
