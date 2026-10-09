/**
 * 默认图的边逻辑。
 *
 * agent 之后：
 * - 没有待执行工具 → 结束（null）
 * - 已达步数上限 → 结束，避免无限 tool 循环
 * - 否则 → tools
 *
 * tools 之后：固定回到 agent，让模型消化工具结果并继续回复或再调工具。
 */
import { agentLog } from "../log/setup";
import type { EdgeFn, GraphState } from "./types";
import { MAX_AGENT_STEPS } from "./types";

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
  if (state.step >= MAX_AGENT_STEPS) {
    log.warn("afterAgent → end", {
      spanId: "afterAgent",
      meta: { step: state.step, reason: "max-steps" },
    });
    return null;
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

/** tools 节点之后固定回到 agent。 */
export const afterTools: EdgeFn<GraphState> = (state) => {
  agentLog("graph.edge").info("afterTools → agent", {
    spanId: "afterTools",
    meta: { step: state.step },
  });
  return "agent";
};
