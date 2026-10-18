/**
 * AgentRuntime 构造与 run 入参类型。
 */
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { AgentRunCommand } from "@thinker-workbench/shared";
import type { CompiledAgentGraph } from "../graph/buildGraph";

/** 创建 runtime 时的可选依赖注入。 */
export type AgentRuntimeOptions = {
  /** Sqlite checkpoint 目录。 */
  checkpointDir?: string;
  /** 自定义 LangGraph checkpointer。 */
  checkpointer?: BaseCheckpointSaver;
  /** 已编译图；不传则 buildGraph(checkpointer)。 */
  graph?: CompiledAgentGraph;
};

/** 一次对话运行的请求。 */
export type RunRequest = AgentRunCommand & {
  runId?: string;
  threadId?: string;
  traceId?: string;
  workspaceRoot?: string;
  workspaceName?: string;
  runContext?: import("./runContext").RunContext;
  /** 主进程排队等待被调度的时长（毫秒）；并入终态事件的 `durationMs`。 */
  queuedMs?: number;
};
