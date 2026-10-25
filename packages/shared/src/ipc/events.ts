/**
 * Agent 运行过程事件：utility → main → renderer。
 * 时间线与 IPC 共用同一套产品事件形状。
 */

import type {
  ChatPlanStatus,
  ChatPlanTodo,
  ChatPlanUpdateHint,
  ChatTimelineResultPathKind,
} from "../protocol/message";
import type { ChatTimelineTodoHint, ChatTodo } from "../protocol/todo";
import type { HitlKind, HitlRequest, HitlResponse } from "./hitl";

/** 所有 AgentEvent 共有字段。 */
export type AgentEventBase = {
  /**
   * 所属聊天会话（端到端寻址）。
   * 注意：与工具事件里的终端 `sessionId` 不同概念。
   */
  chatSessionId?: string;
  /** 所属线程（checkpointer thread_id）。 */
  threadId: string;
  /** 所属运行。 */
  runId: string;
  /** 事件时间戳（Unix 毫秒）。 */
  ts: number;
};

/** 模型文本增量。 */
export type AgentTokenEvent = AgentEventBase & {
  type: "token";
  text: string;
  /** `reply`：助手正文（默认）；`thinking`：推理过程（只进时间线）。 */
  channel?: "reply" | "thinking";
};

/** 节点/阶段提示。 */
export type AgentStatusEvent = AgentEventBase & {
  type: "status";
  status: "planning" | "thinking";
};

/** 工具调用生命周期。 */
export type AgentToolEvent = AgentEventBase & {
  type: "tool";
  phase: "start" | "end";
  name: string;
  callId?: string;
  path?: string;
  summary?: string;
  detail?: string;
  ok?: boolean;
  diff?: string;
  restoreContent?: string;
  restoreCachedAt?: number;
  sessionId?: string;
  command?: string;
  exitCode?: number | null;
  backgrounded?: boolean;
  resultPaths?: string[];
  resultPathKinds?: ChatTimelineResultPathKind[];
  /** `todo` 工具：动作与受影响条目（区分读 / 写）。 */
  todo?: ChatTimelineTodoHint;
  /** `update_plan` 工具：这次更新动了哪几步。 */
  planUpdate?: ChatPlanUpdateHint;
};

/** HITL。 */
export type AgentHitlEvent = AgentEventBase & {
  type: "hitl";
  phase: "request" | "resolved";
  hitlId: string;
  kind: HitlKind;
  request?: HitlRequest;
  response?: HitlResponse;
};

/** 单次模型调用的 token 用量。 */
export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
};

export type AgentUsageEvent = AgentEventBase & {
  type: "usage";
  usage: ModelUsage;
};

export type AgentModelSwitchEvent = AgentEventBase & {
  type: "model_switch";
  fromModelId?: string;
  fromLabel: string;
  toModelId: string;
  toLabel: string;
  reason: "auth" | "not_found" | "rate_limit" | "network" | "server" | "other";
  detail?: string;
  failedModelId?: string;
  failedError?: string;
};

export type AgentModelHealthEvent = AgentEventBase & {
  type: "model_health";
  modelId: string;
  health: "ok" | "error";
  error?: string;
};

/** 子代理 Task 卡片内嵌的精简事件。 */
export type SubagentChildEvent =
  | { type: "status"; status: "planning" | "thinking" }
  | { type: "token"; text: string; channel?: "reply" | "thinking" }
  | {
      type: "tool";
      phase: "start" | "end";
      name: string;
      callId?: string;
      path?: string;
      summary?: string;
      detail?: string;
      ok?: boolean;
      diff?: string;
      command?: string;
      exitCode?: number | null;
      backgrounded?: boolean;
      sessionId?: string;
      restoreContent?: string;
      resultPaths?: string[];
      resultPathKinds?: ChatTimelineResultPathKind[];
    };

export type SubagentTimelineEntry = {
  ts: number;
  kind: string;
  summary: string;
};

export type AgentSubagentEvent = AgentEventBase & {
  type: "subagent";
  phase: "started" | "progress" | "finished" | "failed" | "cancelled";
  taskId: string;
  subagent: string;
  title?: string;
  background?: boolean;
  summary?: string;
  liveLine?: string;
  error?: string;
  childEvent?: SubagentChildEvent;
  timelineEntry?: SubagentTimelineEntry;
};

/** 运行成功结束。 */
export type AgentDoneEvent = AgentEventBase & {
  type: "done";
  text: string;
  /**
   * 本次 run 的墙钟耗时（毫秒，含主进程排队时长）。
   * 由 engine 在终态统一计算，是耗时的**唯一真相**；消费端不得自行推算。
   * 缺省表示未知（例如未进入执行阶段），UI 展示「—」而非 0。
   */
  durationMs?: number;
  /**
   * 本次 run 的累计 token 用量（含子代理）。
   * 由 engine 在唯一模型调用卡口逐次入账、终态统一结算，是用量的**唯一真相**；
   * 消费端只做展示，不得自行累加或粗估。
   * 缺省表示本 run 从未发生模型调用（如准入即失败），UI 展示「—」而非 0。
   */
  usage?: ModelUsage;
  /** true 表示 `usage` 中含粗估成分（网关未回 usage，或中断时按已流出正文补算）。 */
  usageEstimated?: boolean;
};

export type AgentErrorCode = "cancelled" | "failed" | "crashed";

export type AgentErrorEvent = AgentEventBase & {
  type: "error";
  error: string;
  code: AgentErrorCode;
  /** 同 `AgentDoneEvent.durationMs`；准入即失败等未进入执行阶段的情况缺省。 */
  durationMs?: number;
  /** 同 `AgentDoneEvent.usage`：失败 / 取消前已发生的模型调用用量。 */
  usage?: ModelUsage;
  /** 同 `AgentDoneEvent.usageEstimated`。 */
  usageEstimated?: boolean;
};

/** 记忆子系统事件：抽取 / 压缩 / 熔断。 */
export type AgentMemoryEvent = AgentEventBase & {
  type: "memory";
  phase: "extracted" | "compacted" | "circuit_broken";
  /** 记忆种类（抽取时）。 */
  memoryKind?: "project" | "session";
  /** 抽取动作（extracted 时）。 */
  action?: "init" | "update";
  /** 压缩层级（compacted 时）。 */
  layer?: "micro" | "session" | "full";
  /** 抽取出的章节名（extracted 时）。 */
  sections?: string[];
  /** 压缩前消息数。 */
  before?: number;
  /** 压缩后消息数。 */
  after?: number;
  /** 被移除/替换的消息数。 */
  truncated?: number;
};

/**
 * 计划事件。
 * `drafting`：模型正在流式产出 create_plan 参数（草稿逐段刷新，不含正文）；
 * `created`：计划已成型；`updated`：执行阶段每步更新。
 */
export type AgentPlanEvent = AgentEventBase & {
  type: "plan";
  phase: "drafting" | "created" | "updated";
  /** 计划 id，与 `ChatPlan.id` 对齐。 */
  planId: string;
  /** `drafting` 阶段携带的工具调用 id：供时间线把草稿挂到同一次调用上。 */
  callId?: string;
  /** 计划标题；`updated` 时可省略（沿用既有标题）。 */
  title?: string;
  /** 计划简述；`updated` 时可省略（沿用既有简述）。 */
  description?: string;
  /** 计划完成状态。 */
  status: ChatPlanStatus;
  /** 待办列表；`updated` 时为全量替换，保证幂等。 */
  todos: ChatPlanTodo[];
  /** plan.md 正文；`updated` 且正文未变时可省略。 */
  markdown?: string;
};

/**
 * 会话待办事件：全量替换当前会话待办（幂等）。
 *
 * 待办是会话级状态，与计划解耦：`todo` 工具、create_plan、update_plan 都会发。
 */
export type AgentTodoEvent = AgentEventBase & {
  type: "todo";
  /** 全量待办列表（消费端直接替换，不做增量合并）。 */
  todos: ChatTodo[];
  /** 触发来源，供时间线给出不同文案。 */
  origin?: "todo" | "create_plan" | "update_plan";
};

/** 推送给 UI 的全部 agent 事件。 */
export type AgentEvent =
  | AgentTokenEvent
  | AgentStatusEvent
  | AgentToolEvent
  | AgentHitlEvent
  | AgentUsageEvent
  | AgentModelSwitchEvent
  | AgentModelHealthEvent
  | AgentSubagentEvent
  | AgentMemoryEvent
  | AgentPlanEvent
  | AgentTodoEvent
  | AgentDoneEvent
  | AgentErrorEvent;
