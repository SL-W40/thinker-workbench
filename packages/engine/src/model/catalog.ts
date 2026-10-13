/**
 * 模型目录运行时：候选构建、故障切换包装。
 * 配置由 UtilityHost 每轮下发；chat 调用经 withModelFailover。
 */
import {
  buildModelCandidates,
  classifyModelSwitchReason,
  type ModelCatalog,
  type ModelEntry,
  type ModelSelection,
  type ModelSettings,
  type ModelSwitchReason,
  resolveModelSettings,
} from "@thinker-workbench/shared";
import { getRunContext, getRunTurn } from "../runtime/runContext";
import { getRunEmitter } from "../runtime/runEmit";
import { agentEndSpan, agentStartSpan } from "../trace/emit";
import { configureChatModel, getChatModelFor, MODEL_API_KEY_MISSING } from "./openai";
import { formatErrorMessage, isCancelError } from "./retry";
import type { ChatCompletionResult, ChatRequest } from "./types";

/** model.chat 输入：始终带 messages，由 Main truncateForTrace 裁切。 */
function modelChatInputSummary(request: ChatRequest): Record<string, unknown> {
  const messages = request.messages ?? [];
  const tools = request.tools ?? [];
  const toolNames = tools
    .map((t) => t.function?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const last = messages[messages.length - 1];
  const lastRole = last?.role;
  const lastPreview = typeof last?.content === "string" ? last.content.slice(0, 120) : undefined;
  return {
    messageCount: messages.length,
    toolNames,
    lastRole,
    ...(lastPreview ? { lastContentPreview: lastPreview } : {}),
    messages,
    ...(request.system ? { system: request.system } : {}),
  };
}

/** 组装 model.chat 结束 output（含取消半截）。 */
function modelChatOutput(args: {
  modelId: string;
  result?: ChatCompletionResult | null;
  replyBuf: string;
  thinkingBuf: string;
  partial: boolean;
}): Record<string, unknown> {
  const content = args.result?.content ?? args.replyBuf;
  const reasoning = args.result?.reasoning ?? args.thinkingBuf;
  return {
    modelId: args.modelId,
    ...(args.result?.providerResponseId
      ? { providerResponseId: args.result.providerResponseId }
      : {}),
    content,
    ...(reasoning ? { reasoning } : {}),
    toolCalls: args.result?.toolCalls ?? [],
    ...(args.result?.usage ? { usage: args.result.usage } : {}),
    partial: args.partial,
    contentChars: content.length,
    reasoningChars: reasoning.length,
  };
}

/** 进程级目录与选用（hello / 无 ALS）；run 内以 RunContext 为准。 */
let catalog: ModelCatalog | null = null;
let selection: ModelSelection = { mode: "auto" };
/** 本轮用户文本 / 路径（供 Auto 路由）。 */
let routeContext: { userText: string; contextPaths?: string[] } = { userText: "" };

function activeCatalog(): ModelCatalog | null {
  return getRunContext()?.catalog ?? catalog;
}

function activeSelection(): ModelSelection {
  const ctx = getRunContext();
  return ctx ? ctx.selection : selection;
}

function activeRoute(): { userText: string; contextPaths?: string[] } {
  const ctx = getRunContext();
  return ctx ? ctx.routeContext : routeContext;
}

/** 应用主进程下发的目录与选用（有 RunContext 时只写本 run）。 */
export function configureModelCatalog(
  nextCatalog?: ModelCatalog | null,
  nextSelection?: ModelSelection | null,
  route?: { userText?: string; contextPaths?: string[] },
): void {
  const ctx = getRunContext();
  const targetCatalog = ctx ? { holder: ctx as { catalog: ModelCatalog | null } } : null;

  if (nextCatalog) {
    const cloned: ModelCatalog = {
      providers: nextCatalog.providers.map((p) => ({ ...p })),
      models: nextCatalog.models.map((m) => ({ ...m, tags: [...m.tags] })),
      selection: nextCatalog.selection,
      allowEmoji: nextCatalog.allowEmoji,
    };
    if (ctx) ctx.catalog = cloned;
    else catalog = cloned;
  }
  if (nextSelection) {
    if (ctx) ctx.selection = nextSelection;
    else selection = nextSelection;
  } else if (nextCatalog) {
    if (ctx) ctx.selection = nextCatalog.selection;
    else selection = nextCatalog.selection;
  }
  if (route) {
    const nextRoute = {
      userText: route.userText ?? "",
      contextPaths: route.contextPaths,
    };
    if (ctx) ctx.routeContext = nextRoute;
    else routeContext = nextRoute;
  }
  void targetCatalog;

  // 预配置首候选（兼容仍直接 getChatModel 的路径）
  const candidates = listCandidates();
  const first = candidates[0];
  const cat = activeCatalog();
  if (first && cat) {
    const settings = resolveModelSettings(cat, first);
    configureChatModel(settings);
  } else if (cat) {
    configureChatModel({
      apiKey: "",
      baseUrl: "",
      model: "",
      allowEmoji: cat.allowEmoji,
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
  const cat = activeCatalog();
  if (!cat) return [];
  const sel = activeSelection();
  const route = activeRoute();
  return buildModelCandidates(cat, sel, {
    userText: route.userText,
    contextPaths: route.contextPaths,
  });
}

/** 当前选用（供子代理临时覆盖后还原）。 */
export function getModelSelection(): ModelSelection {
  return { ...activeSelection() };
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
  const cat = activeCatalog();
  if (candidates.length === 0 || !cat) {
    throw new Error(MODEL_API_KEY_MISSING);
  }

  const turn = getRunTurn();
  const turnLabel = turn != null ? ` · turn ${turn}` : "";
  const modelSpanId = agentStartSpan({
    name: "model.chat",
    kind: "model",
    summary: `model.chat${turnLabel}`,
    input: modelChatInputSummary(request),
    attrs: {
      ...(turn != null ? { turn } : {}),
    },
  });

  const skippedProviders = new Set<string>();
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    if (!entry) continue;
    if (skippedProviders.has(entry.providerId)) continue;

    const settings = resolveModelSettings(cat, entry);
    if (!settings) {
      lastError = new Error(MODEL_API_KEY_MISSING);
      continue;
    }

    // 同步进程默认（非 ALS 路径）；本调用用 getChatModelFor 避免并行抢占
    configureChatModel(settings);

    const candSpanId = agentStartSpan({
      name: "model.candidate",
      kind: "model",
      summary: `model.candidate${turnLabel} · ${entry.id}`,
      attrs: {
        modelId: entry.id,
        providerId: entry.providerId,
        index: i,
        ...(turn != null ? { turn } : {}),
      },
    });

    // 已向 UI 吐过 token 则不可换模型（避免重复半截回复）
    let emittedTokens = false;
    let replyBuf = "";
    let thinkingBuf = "";
    const wrapped: ChatRequest = {
      ...request,
      onToken: (text, channel) => {
        emittedTokens = true;
        if ((channel ?? "reply") === "thinking") thinkingBuf += text;
        else replyBuf += text;
        request.onToken?.(text, channel);
      },
    };

    try {
      const result = await getChatModelFor(settings).chat(wrapped, signal);
      agentEndSpan(candSpanId, {
        status: "ok",
        attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
      });
      agentEndSpan(modelSpanId, {
        status: "ok",
        summary: `model.chat${turnLabel} · ${entry.id}`,
        output: modelChatOutput({
          modelId: entry.id,
          result,
          replyBuf,
          thinkingBuf,
          partial: false,
        }),
        attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
      });
      return result;
    } catch (err) {
      lastError = err;
      if (isCancelError(err)) {
        agentEndSpan(candSpanId, {
          status: "cancelled",
          error: formatErrorMessage(err),
          attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
        });
        agentEndSpan(modelSpanId, {
          status: "cancelled",
          error: formatErrorMessage(err),
          summary: `model.chat${turnLabel} · ${entry.id}`,
          output: modelChatOutput({
            modelId: entry.id,
            result: null,
            replyBuf,
            thinkingBuf,
            partial: true,
          }),
          attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
        });
        throw err;
      }
      const msg = formatErrorMessage(err);
      if (/MODEL_API_KEY_MISSING|api key is not set/i.test(msg)) {
        agentEndSpan(candSpanId, { status: "error", error: msg });
        agentEndSpan(modelSpanId, {
          status: "error",
          error: msg,
          output: modelChatOutput({
            modelId: entry.id,
            result: null,
            replyBuf,
            thinkingBuf,
            partial: true,
          }),
          attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
        });
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
        agentEndSpan(modelSpanId, {
          status: "error",
          error: msg,
          summary: `model.chat${turnLabel} · ${entry.id}`,
          output: modelChatOutput({
            modelId: entry.id,
            result: null,
            replyBuf,
            thinkingBuf,
            partial: true,
          }),
          attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
        });
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
      agentEndSpan(modelSpanId, {
        status: "error",
        error: msg,
        output: modelChatOutput({
          modelId: entry.id,
          result: null,
          replyBuf,
          thinkingBuf,
          partial: true,
        }),
        attrs: { modelId: entry.id, ...(turn != null ? { turn } : {}) },
      });
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
