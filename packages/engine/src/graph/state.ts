/**
 * 构造一次 run 的初始 GraphState：
 * - messages = 可选历史 + 当前 user
 * - reply / pendingToolCalls 为空
 * - step 从 0 起（进入 agent 后才会 +1）
 */
import type { ChatMessage } from "../model/types";
import type { GraphState } from "./types";

/** 规范化多轮历史：只保留有正文的 user / assistant。 */
function normalizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  if (!history?.length) return [];
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

export function initialState(
  message: string,
  history?: ChatMessage[],
  contextPaths?: string[],
): GraphState {
  return {
    message,
    messages: [...normalizeHistory(history), { role: "user", content: message }],
    reply: "",
    pendingToolCalls: [],
    step: 0,
    ...(contextPaths?.length ? { contextPaths } : {}),
  };
}
