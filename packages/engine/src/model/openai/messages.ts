/**
 * 请求消息组装与 usage / 推理字段归一化（纯函数）。
 */
import { getDataDir } from "../../config/dataDir";
import { messageToApiContent } from "../imageParts";
import type { ChatMessage, ChatUsage } from "../types";

/** 在 messages 前插入 system 消息；用户 image_ref 在此编码为 data URL。 */
export function toApiMessages(system: string, messages: ChatMessage[]): unknown[] {
  const dataDir = getDataDir();
  return [
    { role: "system", content: system },
    ...messages.map((m) => messageToApiContent(m, dataDir)),
  ];
}

/** 从 delta / message 上抽出各家网关的推理字段。 */
export function extractReasoningPiece(source: Record<string, unknown> | undefined): string {
  if (!source) return "";
  for (const key of ["reasoning_content", "reasoning", "thinking"]) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/** 读非负整数；非法则 undefined。 */
export function asNonNegInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return undefined;
}

/**
 * 归一化各家网关的 usage 字段。
 * 支持 OpenAI prompt/completion_tokens、部分网关的 input/output_tokens 与缓存细节。
 */
export function parseUsage(raw: unknown): ChatUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const input = asNonNegInt(u.prompt_tokens) ?? asNonNegInt(u.input_tokens) ?? 0;
  const output = asNonNegInt(u.completion_tokens) ?? asNonNegInt(u.output_tokens) ?? 0;
  const total = asNonNegInt(u.total_tokens);
  if (input === 0 && output === 0 && (total == null || total === 0)) return undefined;

  const promptDetails =
    u.prompt_tokens_details && typeof u.prompt_tokens_details === "object"
      ? (u.prompt_tokens_details as Record<string, unknown>)
      : undefined;
  const completionDetails =
    u.completion_tokens_details && typeof u.completion_tokens_details === "object"
      ? (u.completion_tokens_details as Record<string, unknown>)
      : undefined;

  const cacheRead =
    asNonNegInt(promptDetails?.cached_tokens) ??
    asNonNegInt(u.cache_read_input_tokens) ??
    asNonNegInt(u.cached_tokens) ??
    0;
  const cacheWrite =
    asNonNegInt(u.cache_creation_input_tokens) ??
    asNonNegInt(promptDetails?.cache_write_tokens) ??
    asNonNegInt(u.cache_write_tokens) ??
    0;
  const reasoning =
    asNonNegInt(completionDetails?.reasoning_tokens) ?? asNonNegInt(u.reasoning_tokens) ?? 0;

  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reasoningTokens: reasoning,
  };
}
