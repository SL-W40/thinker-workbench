/**
 * 构造一次 run 的初始图状态：
 * - messages = 可选历史 + 当前 user
 * - reply / pendingToolCalls 为空
 * 步数预算不在图状态里：由 LangGraph recursionLimit 统一承载（见 AgentRuntime）。
 */
import type { ChatImageRef } from "@thinker-workbench/shared";
import { buildUserContent } from "../model/imageParts";
import type { ModelMessage } from "../model/types";
import { projectModelHistory } from "./history";
import type { GraphState } from "./types";

export function initialState(
  message: string,
  history?: Array<{ role: string; content: string; images?: ChatImageRef[] }> | ModelMessage[],
  contextPaths?: string[],
  images?: ChatImageRef[],
): GraphState {
  const userContent = buildUserContent(message, images);
  return {
    message,
    messages: [...projectModelHistory(history), { role: "user", content: userContent }],
    reply: "",
    pendingToolCalls: [],
    startedToolCallIds: [],
    loadedToolNames: [],
    contextPaths: contextPaths?.length ? contextPaths : undefined,
    messagesOverride: [],
    lastToolEndedAt: undefined,
  };
}

/** 读 checkpoint / 旧快照时补齐缺省字段。 */
export function normalizeGraphState(raw: GraphState | (Partial<GraphState> & object)): GraphState {
  const started = Array.isArray((raw as GraphState).startedToolCallIds)
    ? (raw as GraphState).startedToolCallIds.filter((id) => typeof id === "string" && id.trim())
    : [];
  // 旧快照没有该通道，缺省为空集合（延迟层会按需重新装载）
  const loaded = Array.isArray((raw as GraphState).loadedToolNames)
    ? (raw as GraphState).loadedToolNames.filter((name) => typeof name === "string" && name.trim())
    : [];
  return {
    message: typeof raw.message === "string" ? raw.message : "",
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    reply: typeof raw.reply === "string" ? raw.reply : "",
    pendingToolCalls: Array.isArray(raw.pendingToolCalls) ? raw.pendingToolCalls : [],
    startedToolCallIds: started,
    loadedToolNames: loaded,
    contextPaths:
      Array.isArray(raw.contextPaths) && raw.contextPaths.length ? raw.contextPaths : undefined,
    messagesOverride: Array.isArray((raw as GraphState).messagesOverride)
      ? (raw as GraphState).messagesOverride
      : [],
    lastToolEndedAt: typeof raw.lastToolEndedAt === "number" ? raw.lastToolEndedAt : undefined,
  };
}
