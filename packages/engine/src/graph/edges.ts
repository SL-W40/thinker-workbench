/**
 * agent ⇄ tools 条件路由（供 buildGraph 与单测共用）。
 */
import { END } from "@langchain/langgraph";
import { getMaxAgentSteps } from "../config/runtimeLimits";
import type { AgentGraphState } from "./annotation";

/** agent 之后：无工具则结束，否则进 tools（步数满也先 drain）。 */
export function afterAgent(state: AgentGraphState): typeof END | "tools" {
  const pending = state.pendingToolCalls ?? [];
  if (pending.length === 0) return END;
  return "tools";
}

/** tools 之后：还有 pending 继续 tools；步数满结束；否则回 agent。 */
export function afterTools(state: AgentGraphState): typeof END | "tools" | "agent" {
  const pending = state.pendingToolCalls ?? [];
  const step = state.step ?? 0;
  if (pending.length > 0) return "tools";
  if (step >= getMaxAgentSteps()) return END;
  return "agent";
}
