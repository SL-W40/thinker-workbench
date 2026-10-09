/**
 * AgentRuntime 构造与 run 入参类型。
 * RunRequest 在共享层 AgentRunCommand 上补可选的 runId / threadId（宿主可先生成）。
 */
import type { AgentRunCommand } from "@thinker-workbench/shared";
import type { Checkpointer } from "../checkpoint/types";
import type { CompiledGraph, GraphState } from "../graph/types";

/** 创建 runtime 时的可选依赖注入。 */
export type AgentRuntimeOptions = {
  /** 文件 checkpoint 目录（预留；当前默认仍用内存 checkpointer）。 */
  checkpointDir?: string;
  /** 自定义 checkpoint 实现；不传则用 MemoryCheckpointer。 */
  checkpointer?: Checkpointer;
  /** 自定义编译图；不传则用 buildGraph()。 */
  graph?: CompiledGraph<GraphState>;
};

/** 一次对话运行的请求：用户消息 + 可选线程 / 运行 / 追踪 id。 */
export type RunRequest = AgentRunCommand & {
  runId?: string;
  threadId?: string;
  traceId?: string;
  workspaceRoot?: string;
  workspaceName?: string;
};
