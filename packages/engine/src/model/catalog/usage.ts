/**
 * 模型调用用量入账与 Trace 载荷组装（model.chat span 的 input / output）。
 */
import { addRunUsage } from "../../runtime/runContext";
import { estimateTurnUsage } from "../imageParts";
import type { ChatCompletionResult, ChatRequest } from "../types";

/**
 * 入账一次模型调用的用量（本 run 账本）。
 *
 * 放在 `chatWithFailover` 这个**唯一模型调用卡口**：全仓业务调用点只有主图 agent 节点
 * 与 Task 子代理，一处入账即全部覆盖，杜绝「新增调用点忘记上报」这类复发。
 * 官方 usage 优先；缺失时按已流出正文粗估并标记 `estimated = true`。
 * 既无官方值又无正文（多半是还没吐 token 就被取消）时不入账——没东西可算，保持「未知」。
 */
export function bookRequestUsage(
  request: ChatRequest,
  result: ChatCompletionResult | null,
  replyBuf: string,
  thinkingBuf: string,
): void {
  // 不在 run 内（hello / contextUsage 探测）时 addRunUsage 自身会跳过
  const official = result?.usage;
  if (official) {
    addRunUsage(official, false);
    return;
  }
  const output = result?.content || replyBuf;
  const reasoning = result?.reasoning || thinkingBuf;
  if (!output && !reasoning) return;
  const estimate = estimateTurnUsage({
    system: request.system,
    messages: request.messages,
    output,
    reasoning,
  });
  // 回写：供调用方直播 emit 与 Trace output 使用（官方值缺失时才有意义）
  if (result) result.usage = estimate;
  addRunUsage(estimate, true);
}

/** model.chat 输入：始终带 messages，由 Main truncateForTrace 裁切。 */
export function modelChatInputSummary(request: ChatRequest): Record<string, unknown> {
  const messages = request.messages ?? [];
  const tools = request.tools ?? [];
  const last = messages[messages.length - 1];
  const lastRole = last?.role;
  const lastPlain =
    last && typeof last.content === "string"
      ? last.content
      : last && Array.isArray(last.content)
        ? last.content
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n")
        : "";
  const lastPreview = lastPlain ? lastPlain.slice(0, 120) : undefined;
  return {
    messageCount: messages.length,
    ...(tools.length > 0 ? { tools } : {}),
    lastRole,
    ...(lastPreview ? { lastContentPreview: lastPreview } : {}),
    messages,
    ...(request.systemSections && request.systemSections.length > 0
      ? { system: request.systemSections }
      : request.system
        ? { system: request.system }
        : {}),
  };
}

/** 组装 model.chat 结束 output（含取消半截）。 */
export function modelChatOutput(args: {
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
