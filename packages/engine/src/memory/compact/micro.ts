/**
 * micro 压缩：纯截断，不调用 LLM。
 *
 * 始终对单条超长消息做字符截断；当消息数超过阈值时，保留首条（初始上下文占位）
 * 与最近窗口，丢弃中间——且用 alignSafeCut 保证整轮原子。返回新数组（不可变）。
 *
 * 硬边界：切点不会越过最后一条 user 消息（当前任务轮起点）——
 * 当前问题与其后的工具轮次永不丢弃，否则模型会回退回答历史里的旧问题。
 */

import type { ChatMessage } from "../../model/types";
import { alignSafeCut, findLastUserStart } from "./shared";

export interface MicroOptions {
  /** 始终保留的最前消息数（默认 1）。 */
  keepFirst?: number;
  /** 始终保留的最近消息数（默认 24）。 */
  keepRecent?: number;
  /** 单条消息字符上限（默认 4000）。 */
  maxMessageChars?: number;
}

function truncateMessage(m: ChatMessage, maxChars: number): ChatMessage {
  if (typeof m.content === "string") {
    if (m.content.length <= maxChars) return m;
    return { ...m, content: `${m.content.slice(0, maxChars)}\n…(truncated)` };
  }
  return m;
}

/** micro 压缩（不可变）。 */
export function microCompact(messages: ChatMessage[], opts: MicroOptions = {}): ChatMessage[] {
  const keepFirst = opts.keepFirst ?? 1;
  const keepRecent = opts.keepRecent ?? 24;
  const maxChars = opts.maxMessageChars ?? 4_000;

  const truncated = messages.map((m) => truncateMessage(m, maxChars));
  if (truncated.length <= keepFirst + keepRecent) return truncated;

  // 期望切点：最近窗口起点与当前任务轮起点中较早者——保证两者都落在保留区
  const lastUserStart = findLastUserStart(truncated);
  const desired =
    lastUserStart >= 0
      ? Math.min(lastUserStart, truncated.length - keepRecent)
      : truncated.length - keepRecent;
  const cut = alignSafeCut(truncated, desired, keepFirst);
  return [...truncated.slice(0, keepFirst), ...truncated.slice(cut)];
}
