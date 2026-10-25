/**
 * 带故障切换的模型调用：同模型内部仍走 openai 退避重试；失败后切下一候选并 emit model_switch。
 */
import {
  classifyModelSwitchReason,
  type ModelEntry,
  type ModelSwitchReason,
  resolveModelSettings,
} from "@thinker-workbench/shared";
import { getRunTurn } from "../../runtime/runContext";
import { getRunEmitter } from "../../runtime/runEmit";
import { agentEndSpan, agentStartSpan } from "../../trace/emit";
import { configureChatModel, getChatModelFor, MODEL_API_KEY_MISSING } from "../openai";
import { formatErrorMessage, isCancelError } from "../retry";
import type { ChatCompletionResult, ChatRequest } from "../types";
import { activeCatalog, listCandidates } from "./state";
import { bookRequestUsage, modelChatInputSummary, modelChatOutput } from "./usage";

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
    runType: "llm",
    summary: `model.chat${turnLabel}`,
    input: modelChatInputSummary(request),
    attrs: {
      ...(turn != null ? { turn } : {}),
    },
  });

  const skippedProviders = new Set<string>();
  let lastError: unknown;
  // 本次调用累计流出的正文（跨候选保留：故障切换只在尚未吐 token 时发生）
  let replyBuf = "";
  let thinkingBuf = "";
  /** 失败出口统一入账后原样抛出，不改变错误身份（取消判定依赖它）。 */
  const rethrow = (err: unknown): never => {
    bookRequestUsage(request, null, replyBuf, thinkingBuf);
    throw err;
  };

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
      runType: "llm",
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
    // 缓冲区跨候选保留：故障切换只在 `emittedTokens === false` 时发生，故实际不清零
    replyBuf = "";
    thinkingBuf = "";
    const wrapped: ChatRequest = {
      ...request,
      onToken: (text, channel) => {
        emittedTokens = true;
        if ((channel ?? "reply") === "thinking") thinkingBuf += text;
        else replyBuf += text;
        request.onToken?.(text, channel);
      },
      // 参数增量同样算「已吐内容」：切换候选会造成半截 JSON 与重复卡片
      ...(request.onToolCallDelta
        ? {
            onToolCallDelta: (delta) => {
              if (delta.argsChunk) emittedTokens = true;
              request.onToolCallDelta?.(delta);
            },
          }
        : {}),
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
      bookRequestUsage(request, result, replyBuf, thinkingBuf);
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
        rethrow(err);
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
        rethrow(err);
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
        rethrow(err instanceof Error ? err : new Error(msg));
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
      rethrow(err instanceof Error ? err : new Error(msg));
    }
  }

  bookRequestUsage(request, null, replyBuf, thinkingBuf);
  const finalErr =
    lastError instanceof Error
      ? lastError
      : new Error(formatErrorMessage(lastError) || MODEL_API_KEY_MISSING);
  agentEndSpan(modelSpanId, { status: "error", error: finalErr.message });
  throw finalErr;
}
