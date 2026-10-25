/**
 * SSE 流式读取与非流式消息解析。
 */
import { isRecord } from "@thinker-workbench/shared";
import type { ChatCompletionResult, ChatToolCall, ChatToolCallDelta, ChatUsage } from "../types";
import { extractReasoningPiece, parseUsage } from "./messages";

/** 让出一轮事件循环，保证流式过程中 IPC / 取消能被处理。 */
export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 流式 tool_call 按 index 累加用的中间结构。 */
type StreamToolCallAcc = {
  id: string;
  name: string;
  arguments: string;
};

/**
 * 读取 SSE 流：解析 data: 行，累积 content 与 tool_calls，
 * 每个文本片断回调 onToken；tool_call 参数片段在拼装的同时回调 onToolCallDelta
 *（未提供则静默拼装到结束）。
 */
export async function readChatSse(
  body: ReadableStream<Uint8Array>,
  onToken: ((text: string, channel?: "reply" | "thinking") => void) | undefined,
  signal: AbortSignal,
  onToolCallDelta?: (delta: ChatToolCallDelta) => void,
): Promise<ChatCompletionResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let providerResponseId: string | undefined;
  let usage: ChatUsage | undefined;
  const toolAcc = new Map<number, StreamToolCallAcc>();

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error("Chat completion cancelled.");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行切开；最后一段可能不完整，留在 buffer 里
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let json: {
          id?: string;
          usage?: unknown;
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
              reasoning?: string | null;
              thinking?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        try {
          const parsed: unknown = JSON.parse(data);
          // 半包 / 非 JSON / 非对象行直接跳过（模型输出畸形时不应崩溃）
          if (!isRecord(parsed)) continue;
          json = parsed as typeof json;
        } catch {
          // 半包或非 JSON 行直接跳过
          continue;
        }

        // include_usage 时末包常无 delta，只带 usage
        if (typeof json.id === "string" && json.id.trim() && !providerResponseId) {
          providerResponseId = json.id.trim();
        }

        const parsedUsage = parseUsage(json.usage);
        if (parsedUsage) usage = parsedUsage;

        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        const thinkingPiece = extractReasoningPiece(delta as Record<string, unknown>);
        if (thinkingPiece) {
          reasoning += thinkingPiece;
          onToken?.(thinkingPiece, "thinking");
        }

        const piece = delta.content;
        if (typeof piece === "string" && piece.length > 0) {
          content += piece;
          onToken?.(piece, "reply");
        }

        // tool_calls 按 index 合并 id / name / arguments 碎片
        for (const tc of delta.tool_calls ?? []) {
          const index = typeof tc.index === "number" ? tc.index : 0;
          const prev = toolAcc.get(index) ?? { id: "", name: "", arguments: "" };
          if (tc.id) prev.id = tc.id;
          if (tc.function?.name) prev.name += tc.function.name;
          const argsChunk = typeof tc.function?.arguments === "string" ? tc.function.arguments : "";
          if (argsChunk) prev.arguments += argsChunk;
          toolAcc.set(index, prev);
          // 参数增量先给订阅方（名字可能尚未完整，由订阅方按前缀判断）
          if (onToolCallDelta && (argsChunk || tc.function?.name)) {
            onToolCallDelta({
              index,
              ...(prev.id ? { id: prev.id } : {}),
              name: prev.name,
              argsChunk,
            });
          }
        }
      }

      // 每个网络读块后再让出，避免「每 token 一次 setImmediate」拖慢读流、TCP 积压成一股一股
      await yieldEventLoop();
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls: ChatToolCall[] = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, acc], i) => ({
      id: acc.id || `call_${i}`,
      type: "function" as const,
      function: {
        name: acc.name,
        arguments: acc.arguments || "{}",
      },
    }))
    .filter((tc) => tc.function.name.length > 0);

  return {
    content,
    toolCalls,
    ...(usage ? { usage } : {}),
    ...(providerResponseId ? { providerResponseId } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

/** 解析非流式 choices[0].message。 */
export function parseNonStreamMessage(message: {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  thinking?: string | null;
  tool_calls?: ChatToolCall[];
}): ChatCompletionResult & { reasoning?: string } {
  const content = typeof message.content === "string" ? message.content : "";
  const reasoning = extractReasoningPiece(message as Record<string, unknown>);
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.filter(
        (tc) =>
          tc &&
          typeof tc.id === "string" &&
          tc.type === "function" &&
          typeof tc.function?.name === "string",
      )
    : [];
  return { content, toolCalls, ...(reasoning ? { reasoning } : {}) };
}
