/**
 * 构造一次 run 的初始图状态：
 * - messages = 可选历史 + 当前 user
 * - reply / pendingToolCalls 为空
 * 步数预算不在图状态里：由 LangGraph recursionLimit 统一承载（见 AgentRuntime）。
 */
import type { ChatImageRef } from "@thinker-workbench/shared";
import { buildUserContent, contentToPlainText } from "../model/imageParts";
import type { ChatMessage } from "../model/types";
import type { GraphState } from "./types";

/** 规范化多轮历史：保留有正文或附图的 user / assistant。 */
function normalizeHistory(
  history:
    | Array<{ role: string; content: string; images?: ChatImageRef[] }>
    | ChatMessage[]
    | undefined,
): ChatMessage[] {
  if (!history?.length) return [];
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const images =
      "images" in m && Array.isArray(m.images) ? (m.images as ChatImageRef[]) : undefined;
    if (m.role === "user" && images?.length) {
      const text =
        typeof m.content === "string"
          ? m.content
          : contentToPlainText(m.content as ChatMessage["content"]);
      out.push({ role: "user", content: buildUserContent(text, images) });
      continue;
    }
    const content =
      typeof m.content === "string"
        ? m.content.trim()
        : contentToPlainText(m.content as ChatMessage["content"]).trim();
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

export function initialState(
  message: string,
  history?: Array<{ role: string; content: string; images?: ChatImageRef[] }> | ChatMessage[],
  contextPaths?: string[],
  images?: ChatImageRef[],
): GraphState {
  const userContent = buildUserContent(message, images);
  return {
    message,
    messages: [...normalizeHistory(history), { role: "user", content: userContent }],
    reply: "",
    pendingToolCalls: [],
    startedToolCallIds: [],
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
  return {
    message: typeof raw.message === "string" ? raw.message : "",
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    reply: typeof raw.reply === "string" ? raw.reply : "",
    pendingToolCalls: Array.isArray(raw.pendingToolCalls) ? raw.pendingToolCalls : [],
    startedToolCallIds: started,
    contextPaths:
      Array.isArray(raw.contextPaths) && raw.contextPaths.length ? raw.contextPaths : undefined,
    messagesOverride: Array.isArray((raw as GraphState).messagesOverride)
      ? (raw as GraphState).messagesOverride
      : [],
    lastToolEndedAt: typeof raw.lastToolEndedAt === "number" ? raw.lastToolEndedAt : undefined,
  };
}
