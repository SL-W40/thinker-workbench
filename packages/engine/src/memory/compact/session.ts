/**
 * session 压缩：用 LLM 把中段（首条之后、最近窗口之前）摘要为一句话，替换中段。
 * 边界经 alignSafeCut 对齐到整轮。返回新数组（不可变）。
 *
 * 硬边界：tail 保留区起点不会越过最后一条 user 消息（当前任务轮起点）——
 * 当前问题与其后的工具轮次原样保留，摘要只是背景。
 */

import type { ChatMessage } from "../../model/types";
import type { ChatFn } from "../repository";
import { alignSafeCut, findLastUserStart, renderForModel } from "./shared";
import type { CompactResult } from "./types";

const SUMMARY_SYSTEM =
  "Summarize the conversation excerpt into a concise third-person progress note in Markdown. " +
  "The excerpt is BACKGROUND from before the current user request, which is kept separately. " +
  "Preserve exact file paths, function/tool names, decisions, and unresolved issues. " +
  "Use short bullets. No preamble.";

export async function sessionCompact(
  messages: ChatMessage[],
  chat: ChatFn,
  opts: { keepFirst?: number; keepRecent?: number } = {},
): Promise<CompactResult> {
  const keepFirst = opts.keepFirst ?? 1;
  const keepRecent = opts.keepRecent ?? 12;

  const headCut = alignSafeCut(messages, keepFirst, 0);
  // tail 起点：最近窗口起点与当前任务轮起点中较早者——当前问题永不进摘要
  const lastUserStart = findLastUserStart(messages);
  const tailDesired =
    lastUserStart >= 0
      ? Math.min(messages.length - keepRecent, lastUserStart)
      : messages.length - keepRecent;
  const tailCut = alignSafeCut(messages, tailDesired, headCut);
  if (tailCut <= headCut) {
    return {
      messages,
      layer: "session",
      before: messages.length,
      after: messages.length,
      truncated: 0,
    };
  }

  const middle = messages.slice(headCut, tailCut);
  const digest = renderForModel(middle);
  const summary = (await chat(SUMMARY_SYSTEM, `Conversation to summarize:\n${digest}`)).trim();
  const summaryMsg: ChatMessage = {
    role: "user",
    content: `<summary of omitted turns>\n${summary}`,
  };
  const result = [...messages.slice(0, headCut), summaryMsg, ...messages.slice(tailCut)];
  return {
    messages: result,
    layer: "session",
    before: messages.length,
    after: result.length,
    truncated: messages.length - result.length,
  };
}
