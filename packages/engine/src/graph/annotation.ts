/**
 * Agent 图状态：StateGraph Annotation.Root。
 * messages / startedToolCallIds 用 reducer 合并；其余字段 LastValue。
 */
import { Annotation } from "@langchain/langgraph";
import type { ChatMessage, ChatToolCall } from "../model/types";

function appendMessages(left: ChatMessage[], right: ChatMessage[]): ChatMessage[] {
  if (!right.length) return left;
  if (!left.length) return right;
  return left.concat(right);
}

function mergeStartedIds(left: string[], right: string[]): string[] {
  if (!right.length) return left;
  if (!left.length) return right;
  const seen = new Set(left);
  const out = left.slice();
  for (const id of right) {
    const t = typeof id === "string" ? id.trim() : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export const AgentStateAnnotation = Annotation.Root({
  message: Annotation<string>,
  messages: Annotation<ChatMessage[], ChatMessage[]>({
    reducer: appendMessages,
    default: () => [],
  }),
  reply: Annotation<string>,
  pendingToolCalls: Annotation<ChatToolCall[]>,
  startedToolCallIds: Annotation<string[], string[]>({
    reducer: mergeStartedIds,
    default: () => [],
  }),
  /** 最近一次工具执行结束的 epoch ms；串行工具最小间隔用（见 tools 节点）。 */
  lastToolEndedAt: Annotation<number | undefined>({
    reducer: (left, right) => (typeof right === "number" ? right : left),
    default: () => undefined,
  }),
  contextPaths: Annotation<string[] | undefined>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => undefined,
  }),
  /**
   * 模型可见的「压缩副本」消息数组。LastValue（右侧为空则保留）。
   * 压缩后写回此通道以替换追加日志（messages 通道仍是源真实日志）。
   */
  messagesOverride: Annotation<ChatMessage[] | undefined>({
    reducer: (left, right) => (right === undefined ? left : right),
    default: () => [],
  }),
});

export type AgentGraphState = typeof AgentStateAnnotation.State;
export type AgentGraphUpdate = typeof AgentStateAnnotation.Update;
export type GraphState = AgentGraphState;
