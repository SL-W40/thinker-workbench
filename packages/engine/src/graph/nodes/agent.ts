/**
 * agent 节点：一次模型调用。
 *
 * - assembleContext 组装 system / tools / rules / skills
 * - 文本增量经 writer 推送 token
 * - 有 tool_calls 则写入 pendingToolCalls，边导向 tools
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getMaxAgentSteps } from "../../config/runtimeLimits";
import { assembleContext } from "../../context/assembleContext";
import { chatWithFailover } from "../../model/catalog";
import { estimateTurnUsage } from "../../model/imageParts";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { setRunTurn } from "../../runtime/runContext";
import { getRunEmitter } from "../../runtime/runEmit";
import type { AgentGraphState, AgentGraphUpdate } from "../annotation";

/** 一轮模型回合：可能流式文本，也可能请求工具。 */
export async function agent(
  state: AgentGraphState,
  config: LangGraphRunnableConfig,
): Promise<AgentGraphUpdate> {
  const signal = config.signal ?? AbortSignal.timeout(3_600_000);
  const emit = getRunEmitter();
  if (!emit) {
    throw new Error("agent requires an active run emitter for streaming tokens.");
  }

  const step = (state.step ?? 0) + 1;
  const maxSteps = getMaxAgentSteps();
  if (step > maxSteps) {
    throw new Error(`Agent exceeded max steps (${maxSteps}).`);
  }

  const ctx = assembleContext({
    messages: state.messages ?? [],
    aiLocale: getAiLocale(),
    allowEmoji: getAllowEmoji(),
    contextWindow: getContextWindow(),
    contextPaths: state.contextPaths,
  });

  // 尚无 reasoning 正文时用 planning；有 thinking token 后再由 UI 升为 Thinking
  emit({ type: "status", status: "planning" });
  setRunTurn(step);

  const result = await chatWithFailover(
    {
      messages: ctx.messages,
      tools: ctx.tools,
      system: ctx.system,
      systemSections: ctx.systemSections,
      onToken: (text, channel) => {
        emit({ type: "token", text, channel: channel ?? "reply" });
      },
    },
    signal,
  );

  const usage =
    result.usage ??
    estimateTurnUsage({
      system: ctx.system,
      messages: ctx.messages,
      output: result.content,
      reasoning: result.reasoning,
    });
  if (usage.inputTokens > 0 || usage.outputTokens > 0) {
    emit({ type: "usage", usage });
  }

  const assistant: ChatMessage = {
    role: "assistant",
    content: result.content || null,
    ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
  };

  const reply = result.content
    ? state.reply
      ? `${state.reply}\n\n${result.content}`
      : result.content
    : state.reply;

  return {
    step,
    messages: [assistant],
    pendingToolCalls: result.toolCalls,
    reply,
  };
}
