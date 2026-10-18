/**
 * agent ⇄ tools 条件路由（供 buildGraph 与单测共用）。
 * 步数预算不在这里判断：超限由 LangGraph recursionLimit 统一收尾（见 AgentRuntime）。
 */
import { END } from "@langchain/langgraph";
import type { AgentGraphState } from "./annotation";

/** agent 之后：无待执行工具则结束，否则进 tools。 */
export function afterAgent(state: AgentGraphState): typeof END | "tools" {
  const pending = state.pendingToolCalls ?? [];
  if (pending.length === 0) return END;
  return "tools";
}

/** tools 之后：还有 pending 继续 tools；否则回 agent。 */
export function afterTools(state: AgentGraphState): typeof END | "tools" | "agent" {
  const pending = state.pendingToolCalls ?? [];
  if (pending.length > 0) return "tools";
  return "agent";
}
