/**
 * Agent 运行过程事件：utility → main → renderer。
 * 时间线与 IPC 共用同一套产品事件形状。
 */

import type { ChatTimelineResultPathKind } from "../protocol/message";
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
};

export type AgentErrorCode = "cancelled" | "failed" | "crashed";

export type AgentErrorEvent = AgentEventBase & {
  type: "error";
  error: string;
  code: AgentErrorCode;
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
  | AgentDoneEvent
  | AgentErrorEvent;
