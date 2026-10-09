/**
 * 图编排核心类型：节点函数、边函数、编译后的图，以及每轮共享的 GraphState。
 *
 * 拓扑（默认）：agent ↔ tools，直到 agent 不再请求工具或触达步数上限。
 */
import type { ChatMessage, ChatToolCall } from "../model/types";

/** 节点：读当前 state + AbortSignal，返回要合并的补丁或部分 state。 */
export type NodeFn<S> = (state: S, signal: AbortSignal) => Promise<Partial<S> | S>;

/** 边：根据 state 返回下一节点 id；null 表示图运行结束。 */
export type EdgeFn<S> = (state: S) => string | null;

/** 已编译图：入口节点名、节点表、边表（边可为固定字符串或函数）。 */
export type CompiledGraph<S> = {
  start: string;
  nodes: Record<string, NodeFn<S>>;
  edges: Record<string, EdgeFn<S> | string>;
};

/** 单次 run 内 agent↔tools 迭代的安全上限，防止死循环烧额度。 */
export const MAX_AGENT_STEPS = 16;

/** 图在一次 run 中累积的可变状态。 */
export type GraphState = {
  /** 本轮用户原始消息。 */
  message: string;
  /**
   * 多轮对话历史（不含 system；system 由模型客户端在请求时拼上）。
   * 含 user / assistant / tool 消息。
   */
  messages: ChatMessage[];
  /** 已流式推给 UI、并在 done 时返回的助手文本累积。 */
  reply: string;
  /** 最近一轮 agent 产出的 tool_calls；tools 节点跑完后清空。 */
  pendingToolCalls: ChatToolCall[];
  /** 本图遍历中 agent 节点已执行次数。 */
  step: number;
};
