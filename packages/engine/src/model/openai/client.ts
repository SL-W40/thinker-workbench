/**
 * OpenAI 兼容 Chat Completions 客户端（经 modelFetch，尊重 HTTP 兼容模式）。
 *
 * - 有 onToken 时走 SSE 流式；部分网关忽略 stream 时回退解析普通 JSON
 * - tool_calls 在流式过程中按 index 累加，结束后再交给图
 * - 每个网络读块后 yield 事件循环，避免长时间占满 utility 线程影响 IPC
 */
import type { ModelSettings } from "@thinker-workbench/shared";
import { getLimit } from "../../config/runtimeLimits";
import { buildSystemPrompt } from "../../prompts/system";
import { modelFetch } from "../httpFetch";
import {
  formatErrorMessage,
  isRetryableError,
  isRetryableHttpStatus,
  sleepBackoff,
} from "../retry";
import type {
  ChatCompletionResult,
  ChatModel,
  ChatRequest,
  ChatToolCall,
  OpenAIModelOptions,
} from "../types";
import {
  getAiLocale,
  getAllowEmoji,
  getCachedModel,
  getModelOptions,
  setCachedModel,
} from "./config";
import { parseUsage, toApiMessages } from "./messages";
import { parseNonStreamMessage, readChatSse, yieldEventLoop } from "./sse";

/** 规范化 baseUrl：去尾部斜杠，缺省用官方 v1。 */
function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

/** 最小可用的 OpenAI 兼容聊天客户端。 */
export function createOpenAIModel(options: OpenAIModelOptions): ChatModel {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const model = options.model?.trim() || "gpt-4o-mini";

  return {
    async chat(request: ChatRequest, signal: AbortSignal): Promise<ChatCompletionResult> {
      const system = request.system ?? buildSystemPrompt(getAiLocale(), getAllowEmoji());
      const onToken = request.onToken;
      const streaming = typeof onToken === "function";
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

      let lastError: unknown;
      const maxAttempts = getLimit("modelRetryMaxAttempts");
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) {
          throw new Error("Chat completion cancelled.");
        }
        if (attempt > 1) {
          await sleepBackoff(attempt - 1, signal);
        }

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
            res = await modelFetch(`${baseUrl}/chat/completions`, {
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
            lastError = err;
            if (attempt < maxAttempts && isRetryableError(err, { emittedTokens })) {
              continue;
            }
            throw new Error(formatErrorMessage(err));
          }

          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            const httpErr = new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 400)}`);
            lastError = httpErr;
            if (attempt < maxAttempts && isRetryableHttpStatus(res.status)) {
              continue;
            }
            throw httpErr;
          }

          if (streaming) {
            const contentType = res.headers.get("content-type") ?? "";
            // 部分网关忽略 stream=true，仍返回普通 JSON body
            if (contentType.includes("application/json") && !contentType.includes("event-stream")) {
              const data = (await res.json()) as {
                id?: string;
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
              const providerResponseId =
                typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
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
              return {
                ...result,
                ...(usage ? { usage } : {}),
                ...(providerResponseId ? { providerResponseId } : {}),
              };
            }
            if (!res.body) throw new Error("OpenAI stream missing body.");
            try {
              const result = await readChatSse(res.body, trackToken, signal);
              if (!result.content.trim() && result.toolCalls.length === 0) {
                throw new Error("OpenAI stream produced empty content and no tool calls.");
              }
              return result;
            } catch (err) {
              // 流已部分落地则不可重试，避免重复 token
              lastError = err;
              if (attempt < maxAttempts && isRetryableError(err, { emittedTokens })) {
                continue;
              }
              throw new Error(formatErrorMessage(err));
            }
          }

          const data = (await res.json()) as {
            id?: string;
            usage?: unknown;
            choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatToolCall[] } }>;
          };
          const result = parseNonStreamMessage(data.choices?.[0]?.message ?? {});
          const usage = parseUsage(data.usage);
          const providerResponseId =
            typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
          if (!result.content.trim() && result.toolCalls.length === 0) {
            throw new Error("OpenAI response missing content and tool calls.");
          }
          return {
            ...result,
            ...(usage ? { usage } : {}),
            ...(providerResponseId ? { providerResponseId } : {}),
          };
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts && isRetryableError(err, { emittedTokens })) {
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
  const cached = getCachedModel();
  if (cached) return cached;
  const options = getModelOptions();
  if (!options?.apiKey) {
    throw new Error(MODEL_API_KEY_MISSING);
  }
  const next = createOpenAIModel(options);
  setCachedModel(next);
  return next;
}

/** 按给定凭据创建客户端（不改写全局配置；供并行 failover）。 */
export function getChatModelFor(settings: ModelSettings): ChatModel {
  const apiKey = settings.apiKey?.trim() ?? "";
  if (!apiKey) {
    throw new Error(MODEL_API_KEY_MISSING);
  }
  return createOpenAIModel({
    apiKey,
    baseUrl: settings.baseUrl?.trim() || undefined,
    model: settings.model?.trim() || undefined,
  });
}
