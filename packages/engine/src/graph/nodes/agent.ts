/**
 * agent 节点：一次模型调用。
 *
 * - 经 `assembleContext` 统一组装 system / tools / rules / skills
 * - 文本增量经 onToken → RunEmitter(token) 推到 UI
 * - 若有 tool_calls，写入 pendingToolCalls，由 afterAgent 边导向 tools 节点
 * - 纯文本回复则 pending 为空，图结束
 */
import { PREVIEW_BODY_CHARS, withTextPreview } from "@thinker-workbench/logger";
import { assembleContext } from "../../context/assembleContext";
import { agentLog } from "../../log/setup";
import {
  getAiLocale,
  getAllowEmoji,
  getChatModel,
  getContextWindow,
} from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { getRunEmitter } from "../../runtime/runEmit";
import { MAX_AGENT_STEPS, type GraphState } from "../types";

/** 一轮模型回合：可能流式文本，也可能请求工具。 */
export async function agent(state: GraphState, signal: AbortSignal): Promise<Partial<GraphState>> {
  const emit = getRunEmitter();
  if (!emit) {
    throw new Error("agent requires an active run emitter for streaming tokens.");
  }

  const step = state.step + 1;
  if (step > MAX_AGENT_STEPS) {
    throw new Error(`Agent exceeded max steps (${MAX_AGENT_STEPS}).`);
  }

  const ctx = assembleContext({
    messages: state.messages,
    aiLocale: getAiLocale(),
    allowEmoji: getAllowEmoji(),
    contextWindow: getContextWindow(),
    contextPaths: state.contextPaths,
  });

  const log = agentLog("graph.agent");
  const lastMsg = state.messages[state.messages.length - 1];
  const lastText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
  log.info("model call", {
    spanId: `agent-${step}`,
    meta: {
      step,
      messages: state.messages.length,
      tools: ctx.tools.length,
      contextUsed: ctx.usage.used,
      contextLimit: ctx.usage.limit,
      lastRole: lastMsg?.role,
      ...(lastText ? withTextPreview(lastText, "lastMessage", PREVIEW_BODY_CHARS) : {}),
    },
  });

  // C 端时间线：进入模型调用前标为 Thinking
  emit({ type: "status", status: "thinking" });

  const result = await getChatModel().chat(
    {
      messages: ctx.messages,
      tools: ctx.tools,
      system: ctx.system,
      onToken: (text, channel) => {
        emit({ type: "token", text, channel: channel ?? "reply" });
      },
    },
    signal,
  );

  if (result.usage) {
    emit({ type: "usage", usage: result.usage });
  }

  log.info("model result", {
    spanId: `agent-${step}`,
    meta: {
      toolCalls: result.toolCalls.map((tc) => tc.function.name),
      ...(result.usage
        ? {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          }
        : {}),
      ...withTextPreview(result.content, "content", PREVIEW_BODY_CHARS),
    },
  });

  // 助手消息写入历史；有工具调用时带上 tool_calls 字段
  const assistant: ChatMessage = {
    role: "assistant",
    content: result.content || null,
    ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
  };

  // 多轮 agent 文本用空行拼接，作为最终 reply / done.text
  const reply = result.content
    ? state.reply
      ? `${state.reply}\n\n${result.content}`
      : result.content
    : state.reply;

  return {
    step,
    messages: [...state.messages, assistant],
    pendingToolCalls: result.toolCalls,
    reply,
  };
}
