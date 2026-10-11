/**
 * 模型目录运行时：候选构建、故障切换包装。
 * 配置由 UtilityHost 每轮下发；chat 调用经 withModelFailover。
 */
import { isLogPreviewTruncating } from "@thinker-workbench/logger";
import {
  buildModelCandidates,
  classifyModelSwitchReason,
  resolveModelSettings,
  type ModelCatalog,
  type ModelEntry,
  type ModelSelection,
  type ModelSettings,
  type ModelSwitchReason,
} from "@thinker-workbench/shared";
import { getRunEmitter } from "../runtime/runEmit";
import { agentEndSpan, agentStartSpan } from "../trace/emit";
import {
  configureChatModel,
  getChatModel,
  MODEL_API_KEY_MISSING,
} from "./openai";
import {
  formatErrorMessage,
  isCancelError,
} from "./retry";
import type { ChatCompletionResult, ChatRequest } from "./types";

/** model.chat 输入摘要：默认瘦身；Verbose（关闭截断）保留 messages。 */
function modelChatInputSummary(request: ChatRequest): Record<string, unknown> {
  const messages = request.messages ?? [];
  const tools = request.tools ?? [];
  const toolNames = tools
    .map((t) => t.function?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const last = messages[messages.length - 1];
  const lastRole = last?.role;
  const lastPreview =
    typeof last?.content === "string" ? last.content.slice(0, 120) : undefined;
  const base: Record<string, unknown> = {
    messageCount: messages.length,
    toolNames,
    lastRole,
    ...(lastPreview ? { lastContentPreview: lastPreview } : {}),
  };
  if (!isLogPreviewTruncating()) {
    base.messages = messages;
    base.tools = toolNames;
  }
  return base;
}

/** 当前目录与选用。 */
let catalog: ModelCatalog | null = null;
let selection: ModelSelection = { mode: "auto" };
/** 本轮用户文本 / 路径（供 Auto 路由）。 */
let routeContext: { userText: string; contextPaths?: string[] } = { userText: "" };

/** 应用主进程下发的目录与选用。 */
export function configureModelCatalog(
  nextCatalog?: ModelCatalog | null,
  nextSelection?: ModelSelection | null,
  route?: { userText?: string; contextPaths?: string[] },
): void {
  if (nextCatalog) {
    catalog = {
      providers: nextCatalog.providers.map((p) => ({ ...p })),
      models: nextCatalog.models.map((m) => ({ ...m, tags: [...m.tags] })),
      selection: nextCatalog.selection,
      allowEmoji: nextCatalog.allowEmoji,
    };
  }
  if (nextSelection) selection = nextSelection;
  else if (nextCatalog) selection = nextCatalog.selection;
  if (route) {
    routeContext = {
      userText: route.userText ?? "",
      contextPaths: route.contextPaths,
    };
  }

  // 预配置首候选（兼容仍直接 getChatModel 的路径）
  const candidates = listCandidates();
  const first = candidates[0];
  if (first && catalog) {
    const settings = resolveModelSettings(catalog, first);
    configureChatModel(settings);
  } else if (catalog) {
    configureChatModel({
      apiKey: "",
      baseUrl: "",
      model: "",
      allowEmoji: catalog.allowEmoji,
    });
  }
}

/** 兼容旧单字段 configure。 */
export function configureFromLegacyModel(settings?: ModelSettings | null): void {
  if (!settings) return;
  configureChatModel(settings);
}

/** 当前候选列表。 */
export function listCandidates(): ModelEntry[] {
  if (!catalog) return [];
  return buildModelCandidates(catalog, selection, {
    userText: routeContext.userText,
    contextPaths: routeContext.contextPaths,
  });
}

/** 当前选用（供子代理临时覆盖后还原）。 */
export function getModelSelection(): ModelSelection {
  return { ...selection };
}

/**
 * 带故障切换的模型调用。
 * 同模型内部仍走 openai 的退避重试；失败后切下一候选并 emit model_switch。
 */
export async function chatWithFailover(
  request: ChatRequest,
  signal: AbortSignal,
): Promise<ChatCompletionResult> {
  const emit = getRunEmitter();
  const candidates = listCandidates();
  if (candidates.length === 0 || !catalog) {
    throw new Error(MODEL_API_KEY_MISSING);
  }

  const modelSpanId = agentStartSpan({
    name: "model.chat",
    kind: "model",
    summary: "model.chat",
    input: modelChatInputSummary(request),
  });

  const skippedProviders = new Set<string>();
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
      const entry = candidates[i];
      if (!entry) continue;
      if (skippedProviders.has(entry.providerId)) continue;

      const settings = resolveModelSettings(catalog, entry);
      if (!settings) {
        lastError = new Error(MODEL_API_KEY_MISSING);
        continue;
      }

      configureChatModel(settings);

      const candSpanId = agentStartSpan({
        name: "model.candidate",
        kind: "model",
        summary: `model.candidate · ${entry.id}`,
        attrs: { modelId: entry.id, providerId: entry.providerId, index: i },
      });

      // 已向 UI 吐过 token 则不可换模型（避免重复半截回复）
      let emittedTokens = false;
      const wrapped: ChatRequest = {
        ...request,
        onToken: (text, channel) => {
          emittedTokens = true;
          request.onToken?.(text, channel);
        },
      };

      try {
        const result = await getChatModel().chat(wrapped, signal);
        agentEndSpan(candSpanId, {
          status: "ok",
          attrs: { modelId: entry.id },
        });
        agentEndSpan(modelSpanId, {
          status: "ok",
          summary: `model.chat · ${entry.id}`,
          output: {
            modelId: entry.id,
            content: result.content,
            toolCalls: result.toolCalls,
            usage: result.usage,
          },
          attrs: { modelId: entry.id },
        });
        return result;
      } catch (err) {
        lastError = err;
        if (isCancelError(err)) {
          agentEndSpan(candSpanId, {
            status: "cancelled",
            error: formatErrorMessage(err),
          });
          agentEndSpan(modelSpanId, { status: "cancelled", error: formatErrorMessage(err) });
          throw err;
        }
        const msg = formatErrorMessage(err);
        if (/MODEL_API_KEY_MISSING|api key is not set/i.test(msg)) {
          agentEndSpan(candSpanId, { status: "error", error: msg });
          agentEndSpan(modelSpanId, { status: "error", error: msg });
          throw err;
        }

        // 半截失败仍标异常，但不切换
        if (emittedTokens) {
          if (emit) {
            emit({
              type: "model_health",
              modelId: entry.id,
              health: "error",
              error: msg.slice(0, 500),
            });
          }
          agentEndSpan(candSpanId, { status: "error", error: msg, attrs: { modelId: entry.id } });
          agentEndSpan(modelSpanId, { status: "error", error: msg, attrs: { modelId: entry.id } });
          throw err instanceof Error ? err : new Error(msg);
        }

        const reason: ModelSwitchReason = classifyModelSwitchReason(err);
        // 鉴权失败：本轮跳过同 provider
        if (reason === "auth") skippedProviders.add(entry.providerId);

        // 找下一个未跳过的候选
        let next: ModelEntry | undefined;
        for (let j = i + 1; j < candidates.length; j++) {
          const c = candidates[j];
          if (c && !skippedProviders.has(c.providerId)) {
            next = c;
            break;
          }
        }

        agentEndSpan(candSpanId, {
          status: "error",
          error: msg,
          attrs: { modelId: entry.id, reason, switched: Boolean(next) },
        });

        // 通知 main 标异常；若有下一候选则切并继续
        if (next && emit) {
          emit({
            type: "model_switch",
            fromModelId: entry.id,
            fromLabel: entry.label || entry.model,
            toModelId: next.id,
            toLabel: next.label || next.model,
            reason,
            detail: msg.slice(0, 300),
            failedModelId: entry.id,
            failedError: msg.slice(0, 500),
          });
          continue;
        }

        // 无下一候选：回写 health 后抛出
        if (emit) {
          emit({
            type: "model_health",
            modelId: entry.id,
            health: "error",
            error: msg.slice(0, 500),
          });
        }
        agentEndSpan(modelSpanId, { status: "error", error: msg, attrs: { modelId: entry.id } });
        throw err instanceof Error ? err : new Error(msg);
      }
    }

    const finalErr =
      lastError instanceof Error
        ? lastError
        : new Error(formatErrorMessage(lastError) || MODEL_API_KEY_MISSING);
  agentEndSpan(modelSpanId, { status: "error", error: finalErr.message });
  throw finalErr;
}
