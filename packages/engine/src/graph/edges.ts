/**
 * 默认图的边逻辑。
 *
 * agent 之后：
 * - 没有待执行工具 → 结束（null）
 * - 已达步数上限仍先 drain 已挂起工具 → tools
 * - 否则 → tools
 *
 * tools 之后：
 * - 仍有 pending → 继续 tools（一批并行后台 Task 或单个工具）
 * - 已达步数上限 → 结束，不再进 agent
 * - 否则 → agent
 */
import { getMaxAgentSteps } from "../config/runtimeLimits";
import { agentLog } from "../log/setup";
import type { EdgeFn, GraphState } from "./types";

/** agent 节点之后的条件边。 */
export const afterAgent: EdgeFn<GraphState> = (state) => {
  const log = agentLog("graph.edge");
  if (state.pendingToolCalls.length === 0) {
    log.info("afterAgent → end", {
      spanId: "afterAgent",
      meta: { step: state.step, reason: "no-tools" },
    });
    return null;
  }
  // 步数打满仍先跑完已挂起的工具，避免静默丢弃
  if (state.step >= getMaxAgentSteps()) {
    log.warn("afterAgent → tools (drain at max-steps)", {
      spanId: "afterAgent",
      meta: {
        step: state.step,
        reason: "max-steps-drain",
        tools: state.pendingToolCalls.map((tc) => tc.function.name),
      },
    });
    return "tools";
  }
  log.info("afterAgent → tools", {
    spanId: "afterAgent",
    meta: {
      step: state.step,
      tools: state.pendingToolCalls.map((tc) => tc.function.name),
    },
  });
  return "tools";
};

/**
 * tools 之后：若还有 pending 继续 tools；否则回 agent。
 * 已达步数上限则结束，不再进 agent（避免再烧一轮或超限抛错）。
 */
export const afterTools: EdgeFn<GraphState> = (state) => {
  const log = agentLog("graph.edge");
  if (state.pendingToolCalls.length > 0) {
    log.info("afterTools → tools", {
      spanId: "afterTools",
      meta: { step: state.step, remaining: state.pendingToolCalls.length },
    });
    return "tools";
  }
  if (state.step >= getMaxAgentSteps()) {
    log.warn("afterTools → end", {
      spanId: "afterTools",
      meta: { step: state.step, reason: "max-steps" },
    });
    return null;
  }
  log.info("afterTools → agent", {
    spanId: "afterTools",
    meta: { step: state.step },
  });
  return "agent";
};
