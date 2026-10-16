/**
 * 默认 harness：START → agent ⇄ tools → END。
 * 每个节点包一层 graph.* span，并设置 nodeSpanId，供并行 tool:Task 挂父。
 */
import {
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { formatErrorMessage } from "../model/retry";
import { agentEndSpan, agentStartSpan, configureAgentTrace } from "../trace/emit";
import { type AgentGraphState, AgentStateAnnotation } from "./annotation";
import { afterAgent, afterTools } from "./edges";
import { agent } from "./nodes/agent";
import { tools } from "./nodes/tools";

/** 当前图节点 run：设置 nodeSpanId。 */
async function withNodeSpan<T>(
  nodeId: string,
  step: number | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const nodeSpanId = agentStartSpan({
    name: `graph.${nodeId}`,
    runType: "chain",
    summary: `graph.${nodeId}`,
    attrs: step != null ? { step } : undefined,
  });
  configureAgentTrace({ nodeSpanId });
  try {
    const result = await run();
    agentEndSpan(nodeSpanId, { status: "ok" });
    return result;
  } catch (err) {
    agentEndSpan(nodeSpanId, {
      status: /cancel/i.test(formatErrorMessage(err)) ? "cancelled" : "error",
      error: formatErrorMessage(err),
    });
    throw err;
  } finally {
    configureAgentTrace({ nodeSpanId: undefined });
  }
}

export type CompiledAgentGraph = ReturnType<typeof buildGraph>;

/** 编译 StateGraph；缺省 MemorySaver，生产传 SqliteSaver。 */
export function buildGraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode("agent", async (state: AgentGraphState, config: LangGraphRunnableConfig) => {
      return withNodeSpan("agent", state.step, () => agent(state, config));
    })
    .addNode("tools", async (state: AgentGraphState, config: LangGraphRunnableConfig) => {
      return withNodeSpan("tools", state.step, () => tools(state, config));
    })
    .addEdge(START, "agent")
    .addConditionalEdges("agent", afterAgent)
    .addConditionalEdges("tools", afterTools);

  return workflow.compile({
    checkpointer: checkpointer ?? new MemorySaver(),
  });
}
