/**
 * OpenAI 兼容 Chat Completions 客户端（基于 fetch）。
 *
 * - 配置来自主进程 hello / 每次 run 的 ModelSettings
 * - 有 onToken 时走 SSE 流式；部分网关忽略 stream 时回退解析普通 JSON
 * - tool_calls 在流式过程中按 index 累加，结束后再交给图
 * - 每个网络读块后 yield 事件循环，避免长时间占满 utility 线程影响 IPC
 */
import { PREVIEW_BODY_CHARS, withTextPreview } from "@thinker-workbench/logger";
import {
  DEFAULT_AI_LOCALE,
  normalizeAiLocale,
  type AiLocale,
  type ModelSettings,
} from "@thinker-workbench/shared";
import { agentLog } from "../log/setup";
import { buildSystemPrompt } from "../prompts/system";
import {
  formatErrorMessage,
  isRetryableError,
  isRetryableHttpStatus,
  MODEL_RETRY_MAX_ATTEMPTS,
  sleepBackoff,
} from "./retry";
import type {
  ChatCompletionResult,
  ChatMessage,
  ChatModel,
  ChatRequest,
  ChatToolCall,
  ChatUsage,
  OpenAIModelOptions,
} from "./types";

/** 当前生效的模型配置；无 apiKey 时为 null。 */
let configured: OpenAIModelOptions | null = null;
/** 配置变更后需重建的客户端缓存。 */
let cached: ChatModel | null = null;
/** 回复语言偏好（写入 system prompt）。 */
let aiLocale: AiLocale = DEFAULT_AI_LOCALE;
/** 是否允许回复使用 emoji（写入 system prompt；默认禁止）。 */
let allowEmoji = false;
/** 上下文窗口上限；未设置时 assembleContext 用默认 128K。 */
let contextWindow: number | undefined;

/** 应用桌面 Settings 下发的模型配置；会清空已缓存的客户端。 */
export function configureChatModel(settings?: ModelSettings | null): void {
  allowEmoji = settings?.allowEmoji ?? false;
  contextWindow =
    typeof settings?.contextWindow === "number" &&
    Number.isFinite(settings.contextWindow) &&
    settings.contextWindow > 0
      ? Math.floor(settings.contextWindow)
      : undefined;
  const apiKey = settings?.apiKey?.trim() ?? "";
  if (!apiKey) {
    configured = null;
    cached = null;
    return;
  }
  configured = {
    apiKey,
    baseUrl: settings?.baseUrl?.trim() || undefined,
    model: settings?.model?.trim() || undefined,
  };
  cached = null;
}

/** 设置后续补全的优先回复语言。 */
export function configureAiLocale(locale?: AiLocale | null): void {
  aiLocale = normalizeAiLocale(locale, DEFAULT_AI_LOCALE);
}

/** 当前 AI 语言（供 assembleContext）。 */
export function getAiLocale(): AiLocale {
  return aiLocale;
}

/** 当前是否允许 emoji。 */
export function getAllowEmoji(): boolean {
  return allowEmoji;
}

/** 当前上下文窗口；未配置返回 undefined。 */
export function getContextWindow(): number | undefined {
  return contextWindow;
}

/** 规范化 baseUrl：去尾部斜杠，缺省用官方 v1。 */
function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

/** 让出一轮事件循环，保证流式过程中 IPC / 取消能被处理。 */
function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 流式 tool_call 按 index 累加用的中间结构。 */
type StreamToolCallAcc = {
  id: string;
  name: string;
  arguments: string;
};

/** 在 messages 前插入 system 消息（图 state 里不存 system）。 */
function toApiMessages(system: string, messages: ChatMessage[]): unknown[] {
  return [{ role: "system", content: system }, ...messages];
}

/** 从 delta / message 上抽出各家网关的推理字段。 */
function extractReasoningPiece(source: Record<string, unknown> | undefined): string {
  if (!source) return "";
  for (const key of ["reasoning_content", "reasoning", "thinking"]) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/** 读非负整数；非法则 undefined。 */
function asNonNegInt(value: unknown): number | undefined {
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
function parseUsage(raw: unknown): ChatUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const input =
    asNonNegInt(u.prompt_tokens) ?? asNonNegInt(u.input_tokens) ?? 0;
  const output =
    asNonNegInt(u.completion_tokens) ?? asNonNegInt(u.output_tokens) ?? 0;
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
    asNonNegInt(completionDetails?.reasoning_tokens) ??
    asNonNegInt(u.reasoning_tokens) ??
    0;

  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reasoningTokens: reasoning,
  };
}

/**
 * 读取 SSE 流：解析 data: 行，累积 content 与 tool_calls，
 * 每个文本片断回调 onToken；tool_call 静默拼装到结束。
 */
async function readChatSse(
  body: ReadableStream<Uint8Array>,
  onToken: ((text: string, channel?: "reply" | "thinking") => void) | undefined,
  signal: AbortSignal,
): Promise<ChatCompletionResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
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
          json = JSON.parse(data) as typeof json;
        } catch {
          // 半包或非 JSON 行直接跳过
          continue;
        }

        // include_usage 时末包常无 delta，只带 usage
        const parsedUsage = parseUsage(json.usage);
        if (parsedUsage) usage = parsedUsage;

        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        const thinkingPiece = extractReasoningPiece(delta as Record<string, unknown>);
        if (thinkingPiece) {
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
          if (typeof tc.function?.arguments === "string") prev.arguments += tc.function.arguments;
          toolAcc.set(index, prev);
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

  return { content, toolCalls, ...(usage ? { usage } : {}) };
}

/** 解析非流式 choices[0].message。 */
function parseNonStreamMessage(message: {
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

/** 最小可用的 OpenAI 兼容聊天客户端。 */
export function createOpenAIModel(options: OpenAIModelOptions): ChatModel {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const model = options.model?.trim() || "gpt-4o-mini";

  return {
    async chat(request: ChatRequest, signal: AbortSignal): Promise<ChatCompletionResult> {
      const log = agentLog("model.openai");
      const system = request.system ?? buildSystemPrompt(aiLocale, allowEmoji);
      const onToken = request.onToken;
      const streaming = typeof onToken === "function";
      const toolCount = request.tools?.length ?? 0;
      const body: Record<string, unknown> = {
        model,
        stream: streaming,
        messages: toApiMessages(system, request.messages),
      };
      // 流式末包带回 usage（OpenAI / 多数兼容网关）
      if (streaming) {
        body.stream_options = { include_usage: true };
      }
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools;
        body.tool_choice = "auto";
      }

      const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
      const lastUserText = typeof lastUser?.content === "string" ? lastUser.content : "";
      log.info("request", {
        meta: {
          model,
          streaming,
          messages: request.messages.length,
          tools: toolCount,
          ...(lastUserText ? withTextPreview(lastUserText, "lastUser", PREVIEW_BODY_CHARS) : {}),
        },
      });

      let lastError: unknown;
      for (let attempt = 1; attempt <= MODEL_RETRY_MAX_ATTEMPTS; attempt++) {
        if (signal.aborted) {
          throw new Error("Chat completion cancelled.");
        }
        if (attempt > 1) {
          log.warn("retry", {
            meta: {
              attempt,
              maxAttempts: MODEL_RETRY_MAX_ATTEMPTS,
              error: formatErrorMessage(lastError),
            },
          });
          await sleepBackoff(attempt - 1, signal);
        }

        const started = Date.now();
        /** 本轮是否已向 UI 推送过 token；推送后失败不可整请求重试。 */
        let emittedTokens = false;
        const trackToken: typeof onToken =
          typeof onToken === "function"
            ? (text, channel) => {
                if (text) emittedTokens = true;
                onToken(text, channel);
              }
            : undefined;

        try {
          let res: Response;
          try {
            res = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: streaming ? "text/event-stream" : "application/json",
                authorization: `Bearer ${options.apiKey}`,
              },
              body: JSON.stringify(body),
              signal,
            });
          } catch (err) {
            const error = formatErrorMessage(err);
            log.error("fetch failed", { meta: { error, ms: Date.now() - started, attempt } });
            lastError = err;
            if (
              attempt < MODEL_RETRY_MAX_ATTEMPTS &&
              isRetryableError(err, { emittedTokens })
            ) {
              continue;
            }
            throw new Error(error);
          }

          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            log.error("http error", {
              meta: {
                status: res.status,
                body: errBody.slice(0, 200),
                ms: Date.now() - started,
                attempt,
              },
            });
            const httpErr = new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 400)}`);
            lastError = httpErr;
            if (
              attempt < MODEL_RETRY_MAX_ATTEMPTS &&
              isRetryableHttpStatus(res.status)
            ) {
              continue;
            }
            throw httpErr;
          }

          const finish = (result: ChatCompletionResult, mode: string) => {
            log.info("response", {
              meta: {
                mode,
                toolCalls: result.toolCalls.map((tc) => tc.function.name),
                ms: Date.now() - started,
                attempt,
                ...withTextPreview(result.content, "content", PREVIEW_BODY_CHARS),
              },
            });
            return result;
          };

          if (streaming) {
            const contentType = res.headers.get("content-type") ?? "";
            // 部分网关忽略 stream=true，仍返回普通 JSON body
            if (contentType.includes("application/json") && !contentType.includes("event-stream")) {
              const data = (await res.json()) as {
                usage?: unknown;
                choices?: Array<{
                  message?: {
                    content?: string | null;
                    reasoning_content?: string | null;
                    tool_calls?: ChatToolCall[];
                  };
                }>;
              };
              const result = parseNonStreamMessage(data.choices?.[0]?.message ?? {});
              const usage = parseUsage(data.usage);
              if (result.reasoning) {
                trackToken?.(result.reasoning, "thinking");
                await yieldEventLoop();
              }
              if (result.content) {
                trackToken?.(result.content, "reply");
                await yieldEventLoop();
              }
              if (!result.content.trim() && result.toolCalls.length === 0) {
                throw new Error("OpenAI response missing content and tool calls.");
              }
              return finish(
                { ...result, ...(usage ? { usage } : {}) },
                "json-fallback",
              );
            }
            if (!res.body) throw new Error("OpenAI stream missing body.");
            try {
              const result = await readChatSse(res.body, trackToken, signal);
              if (!result.content.trim() && result.toolCalls.length === 0) {
                throw new Error("OpenAI stream produced empty content and no tool calls.");
              }
              return finish(result, "sse");
            } catch (err) {
              // 流已部分落地则不可重试，避免重复 token
              lastError = err;
              if (
                attempt < MODEL_RETRY_MAX_ATTEMPTS &&
                isRetryableError(err, { emittedTokens })
              ) {
                continue;
              }
              throw new Error(formatErrorMessage(err));
            }
          }

          const data = (await res.json()) as {
            usage?: unknown;
            choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatToolCall[] } }>;
          };
          const result = parseNonStreamMessage(data.choices?.[0]?.message ?? {});
          const usage = parseUsage(data.usage);
          if (!result.content.trim() && result.toolCalls.length === 0) {
            throw new Error("OpenAI response missing content and tool calls.");
          }
          return finish({ ...result, ...(usage ? { usage } : {}) }, "json");
        } catch (err) {
          lastError = err;
          if (
            attempt < MODEL_RETRY_MAX_ATTEMPTS &&
            isRetryableError(err, { emittedTokens })
          ) {
            continue;
          }
          throw err instanceof Error ? err : new Error(formatErrorMessage(err));
        }
      }

      throw new Error(formatErrorMessage(lastError) || "OpenAI request failed.");
    },
  };
}

/** 未配置 API key 时抛出的稳定错误码（renderer 据此渲染跳转芯片）。 */
export const MODEL_API_KEY_MISSING = "MODEL_API_KEY_MISSING";

/** 图节点共用的模型实例；Settings 未配置 apiKey 时抛错提示。 */
export function getChatModel(): ChatModel {
  if (cached) return cached;
  if (!configured?.apiKey) {
    throw new Error(MODEL_API_KEY_MISSING);
  }
  cached = createOpenAIModel(configured);
  return cached;
}
