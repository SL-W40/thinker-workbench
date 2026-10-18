/**
 * full 压缩：用 LLM 把历史部分摘要为一条背景便签（兜底，会话过长时启用）。
 * 当前任务轮（最后一条 user 消息及其后的工具轮次）不进摘要、原样保留在末尾；
 * 摘要提示词明确其只是背景，防止模型回退回答历史里的旧问题。返回新数组（不可变）。
 */

import type { ChatMessage } from "../../model/types";
import type { ChatFn } from "../repository";
import { alignSafeCut, findLastUserStart, renderForModel } from "./shared";
import type { CompactResult } from "./types";

const SUMMARY_SYSTEM =
  "Summarize the conversation excerpt into a single concise third-person progress note in " +
  "Markdown. The excerpt is BACKGROUND from before the current user request, which is kept " +
  "separately after this summary; never restate it as a new instruction. Preserve exact file " +
  "paths, function/tool names, decisions, and unresolved issues. Use short bullets. No preamble.";

export async function fullCompact(
  messages: ChatMessage[],
  chat: ChatFn,
  opts: { keepFirst?: number } = {},
): Promise<CompactResult> {
  const keepFirst = opts.keepFirst ?? 1;
  // 摘要范围：[headCut, tailStart)——当前任务轮（最后一条 user 起）不参与摘要
  const lastUserStart = findLastUserStart(messages);
  const tailStart = lastUserStart >= 0 ? lastUserStart : messages.length;
  const headCut = alignSafeCut(messages, keepFirst, 0);
  const middle = messages.slice(headCut, tailStart);
  if (middle.length === 0) {
    return {
      messages,
      layer: "full",
      before: messages.length,
      after: messages.length,
      truncated: 0,
    };
  }

  const digest = renderForModel(middle);
  const summary = (await chat(SUMMARY_SYSTEM, `Conversation to summarize:\n${digest}`)).trim();
  const summaryMsg: ChatMessage = {
    role: "user",
    content: `<session summary of earlier turns>\n${summary}`,
  };
  const result = [...messages.slice(0, headCut), summaryMsg, ...messages.slice(tailStart)];
  return {
    messages: result,
    layer: "full",
    before: messages.length,
    after: result.length,
    truncated: messages.length - result.length,
  };
}
