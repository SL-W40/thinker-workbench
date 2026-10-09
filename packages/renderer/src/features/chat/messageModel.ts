/**
 * 聊天消息工厂与规范化（历史转 agent、兼容旧 System 气泡）。
 */
import {
  type AgentHistoryMessage,
  type ChatMessage,
  type ChatTimelineStep,
  createId,
  type Role,
} from "@thinker-workbench/shared";
import { classifyRunError } from "./runErrors";
import { isMissingApiKeyError } from "./systemErrors";

/** 取助手气泡对模型可见的正文：优先 `text`，否则拼 timeline 里的 text 步。 */
export function visibleAssistantText(message: ChatMessage): string {
  const direct = message.text?.trim() ?? "";
  if (direct) return direct;
  const parts: string[] = [];
  for (const step of message.timeline ?? []) {
    if (step.kind === "text" && step.text.trim()) parts.push(step.text.trim());
  }
  return parts.join("\n\n");
}

/**
 * 将 UI 消息列表转为 agent 多轮历史（不含当前待发送轮）。
 * 跳过 pending / 空正文 / system；排除 `excludeIds` 中的气泡。
 */
export function toAgentHistory(
  messages: ChatMessage[],
  excludeIds?: ReadonlySet<string>,
): AgentHistoryMessage[] {
  const out: AgentHistoryMessage[] = [];
  for (const m of messages) {
    if (excludeIds?.has(m.id)) continue;
    if (m.pending) continue;
    if (m.role === "user") {
      const content = m.text?.trim() ?? "";
      if (content) out.push({ role: "user", content });
      continue;
    }
    if (m.role === "assistant") {
      const content = visibleAssistantText(m);
      if (content) out.push({ role: "assistant", content });
    }
  }
  return out;
}

/** 创建一条聊天消息（含 id、时间戳、可选 pending / timeline）。 */
export function createMessage(
  role: Role,
  text: string,
  pending = false,
  timeline?: ChatTimelineStep[],
): ChatMessage {
  return {
    id: createId("msg"),
    role,
    text,
    createdAt: Date.now(),
    pending,
    ...(timeline ? { timeline } : {}),
  };
}

/**
 * 把历史 System 气泡收成助手 + 错误时间线，避免再渲染 Sys 头像。
 * 新路径不再产生 system 角色；此函数仅兼容旧会话快照。
 */
export function normalizeChatMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "system") return message;
  const text = message.text?.trim() ?? "";
  const timeline = [...(message.timeline ?? [])];
  const hasError = timeline.some((s) => s.kind === "error");
  if (text && !hasError) {
    timeline.push({
      id: createId("tl"),
      kind: "error",
      message: text,
      code:
        classifyRunError(text) ??
        (isMissingApiKeyError(text) ? "MODEL_API_KEY_MISSING" : undefined),
    });
  }
  return {
    ...message,
    role: "assistant",
    text: "",
    pending: false,
    timeline,
  };
}
