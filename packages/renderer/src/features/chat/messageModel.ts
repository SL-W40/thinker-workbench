/**
 * 聊天消息工厂与历史转 agent。
 */
import {
  type AgentHistoryMessage,
  type ChatImageRef,
  type ChatMessage,
  type ChatTimelineStep,
  createId,
  type Role,
} from "@thinker-workbench/shared";
import { finishMessageClock } from "./messageClock";
import { classifyRunError } from "./runErrors";
import { appendError } from "./timelineModel";

/**
 * 保留已流式的正文；错误只出现在 timeline。失败时一并写入耗时。
 * `durationMs` 缺省表示未知（UI 展示「—」）。
 */
export function failAssistantMessage(
  message: ChatMessage,
  errorText: string,
  timeline: ChatTimelineStep[],
  /** 显式错误码；省略时从文案推断*/
  code?: string,
  durationMs?: number,
): ChatMessage {
  const resolved = code ?? classifyRunError(errorText);
  const nextTimeline = appendError(timeline, errorText, resolved);
  return finishMessageClock(
    {
      ...message,
      pending: false,
      role: "assistant",
      // 错误不进气泡正文，避免与时间线重复；保留已生成的部分回复
      text: message.text,
      timeline: nextTimeline,
    },
    durationMs,
  );
}

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
 * 跳过 pending / 空正文且无图 / system；排除 `excludeIds` 中的气泡。
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
      const images = Array.isArray(m.images) && m.images.length > 0 ? m.images : undefined;
      if (!content && !images?.length) continue;
      out.push({
        role: "user",
        content,
        ...(images ? { images } : {}),
      });
      continue;
    }
    if (m.role === "assistant") {
      const content = visibleAssistantText(m);
      if (content) out.push({ role: "assistant", content });
    }
  }
  return out;
}

/** 创建一条聊天消息（含 id、时间戳、可选 pending / timeline / images）。 */
export function createMessage(
  role: Role,
  text: string,
  pending = false,
  timeline?: ChatTimelineStep[],
  images?: ChatImageRef[],
): ChatMessage {
  return {
    id: createId("msg"),
    role,
    text,
    createdAt: Date.now(),
    pending,
    ...(timeline ? { timeline } : {}),
    ...(images?.length ? { images } : {}),
  };
}
