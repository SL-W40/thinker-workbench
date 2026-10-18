/**
 * 压缩层共享工具。
 *
 * 整轮安全切分（alignSafeCut）：保证切分点不破坏「assistant(tool_calls) ↔ tool 结果」
 * 的成对关系——切分后保留区首条不能是孤立 tool 结果，且切分点前一条不可以是
 * 带 tool_calls 的 assistant（其工具结果将被丢弃），避免模型拿到悬空 tool_call。
 */

import type { ChatMessage } from "../../model/types";

/** 判断某索引是否为安全切分点：保留区从 i 开始。 */
function isSafeCut(messages: ChatMessage[], i: number): boolean {
  if (i <= 0) return true;
  const at = messages[i];
  if (at?.role === "tool") return false; // 孤立 tool 结果起点
  const prev = messages[i - 1];
  if (prev?.role === "assistant" && (prev.tool_calls?.length ?? 0) > 0) return false; // 悬空 tool_call
  return true;
}

/** 把期望切分点对齐到最近的安全点（会前后微调，跳过工具结果段）。 */
export function alignSafeCut(messages: ChatMessage[], desired: number, minCut: number): number {
  let c = Math.max(desired, minCut, 0);
  let guard = 0;
  while (guard++ < messages.length + 4) {
    while (c < messages.length && messages[c]?.role === "tool") c++; // 起点跳过 tool 段
    if (isSafeCut(messages, c)) break;
    c--;
  }
  return Math.max(c, 0);
}

/**
 * 最后一条 user 消息的下标（当前任务轮起点）；无 user 消息返回 -1。
 * 压缩层的硬边界：该消息及其后的当前工作轮（工具调用/结果）必须原样保留，
 * 否则模型会丢失"现在要做什么"（曾导致压缩后答非所问，回退回答历史里的旧问题）。
 */
export function findLastUserStart(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

/** 把消息渲染为送模型的紧凑文本（用于摘要）。 */
export function renderForModel(messages: ChatMessage[], maxPerMessage = 1_200): string {
  const lines: string[] = [];
  for (const m of messages) {
    let body: string;
    if (typeof m.content === "string") {
      body = m.content;
    } else if (Array.isArray(m.content)) {
      body = m.content
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("");
    } else {
      body = "";
    }
    if (m.tool_calls?.length) {
      const calls = m.tool_calls.map((tc) => tc.function.name).join(", ");
      body = `${body}\n[calls: ${calls}]`.trim();
    }
    const text = body.replace(/\s+/g, " ").trim();
    if (text) lines.push(`<${m.role}>: ${text.slice(0, maxPerMessage)}`);
  }
  return lines.join("\n");
}
