/**
 * 驱动 StateGraph stream：updates 取 reply，custom 转发产品事件。
 * 执行步数预算 = 本 run 的 limits.maxAgentSteps，1:1 映射 LangGraph recursionLimit。
 */
import type { AgentEvent } from "@thinker-workbench/shared";
import { getLimit } from "../config/runtimeLimits";
import type { CompiledAgentGraph } from "../graph/buildGraph";
import { normalizeGraphState } from "../graph/state";
import type { GraphState } from "../graph/types";
import type { RunController } from "./RunController";
import { getRunContext } from "./runContext";
import { isRecursionLimitError } from "./terminalOutcome";

/**
 * @param ctx.runKey LangGraph 线程键（run 级 `threadId::run:runId`）；resume 时为被中断 run 的键。
 */
export async function streamLoop(
  emit: (event: AgentEvent) => void,
  graph: CompiledAgentGraph,
  input: GraphState | null,
  ctx: {
    threadId: string;
    runId: string;
    runKey: string;
    controller: RunController;
    resume: boolean;
  },
): Promise<string> {
  const { runKey, controller, resume } = ctx;
  const runCtx = getRunContext();
  const config = {
    configurable: { thread_id: runKey },
    signal: controller.signal,
    // 步数预算：设置里的「最大执行步数」= LangGraph superstep，直接 1:1 下发
    recursionLimit: getLimit("maxAgentSteps"),
    streamMode: ["updates", "custom"] as Array<"updates" | "custom">,
  };

  // 进入前挂 markToolCallStarted：用 updateState 合并 startedToolCallIds
  if (runCtx) {
    runCtx.markToolCallStarted = async (callId: string) => {
      const id = callId.trim();
      if (!id) return;
      const snap = await graph.getState({ configurable: { thread_id: runKey } });
      const cur = normalizeGraphState((snap?.values ?? {}) as GraphState);
      if (cur.startedToolCallIds.includes(id)) return;
      await graph.updateState(
        { configurable: { thread_id: runKey } },
        { startedToolCallIds: [id] },
      );
    };
  }

  const stream = resume
    ? await graph.stream(null, config)
    : await graph.stream(input as GraphState, config);

  let lastReply = input?.reply ?? "";
  const readFinalReply = async (): Promise<string> => {
    const finalSnap = await graph.getState({ configurable: { thread_id: runKey } });
    const finalState = normalizeGraphState(
      (finalSnap?.values ?? { reply: lastReply }) as GraphState,
    );
    return finalState.reply || finalState.message || lastReply;
  };

  try {
    for await (const chunk of stream) {
      if (controller.aborted) throw new Error("Run cancelled.");
      if (!Array.isArray(chunk) || chunk.length < 2) continue;
      const [mode, data] = chunk as [string, unknown];
      if (mode === "custom") {
        if (data && typeof data === "object" && "type" in data) {
          emit(data as AgentEvent);
        }
        continue;
      }
      if (mode !== "updates" || !data || typeof data !== "object") continue;
      const nodes = data as Record<string, Partial<GraphState>>;
      for (const patch of Object.values(nodes)) {
        if (patch && typeof patch.reply === "string") lastReply = patch.reply;
      }
    }
  } catch (err) {
    // 步数预算用尽：LangGraph 兜底终止，按已有部分回复优雅收尾
    if (isRecursionLimitError(err)) return readFinalReply();
    throw err;
  } finally {
    if (runCtx) runCtx.markToolCallStarted = undefined;
  }

  return readFinalReply();
}
