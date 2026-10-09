/**
 * 组装默认 harness 图：
 *
 *   start → agent ⇄ tools →（无工具 / 超步数）结束
 *
 * 节点与边可被测试替换；生产路径由 AgentRuntime 默认调用本函数。
 */
import { afterAgent, afterTools } from "./edges";
import { agent } from "./nodes/agent";
import { tools } from "./nodes/tools";
import type { CompiledGraph, GraphState } from "./types";

export function buildGraph(): CompiledGraph<GraphState> {
  return {
    start: "agent",
    nodes: {
      agent,
      tools,
    },
    edges: {
      agent: afterAgent,
      tools: afterTools,
    },
  };
}
