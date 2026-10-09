/**
 * Agent 运行过程事件。
 * utility → main → renderer 推送的时间线条目；与 `RunResult` 互补（流式过程 vs 同步收尾）。
 */

/** 所有 AgentEvent 共有字段。 */
export type AgentEventBase = {
  /** 所属线程。 */
  threadId: string;
  /** 所属运行。 */
  runId: string;
  /** 事件时间戳（Unix 毫秒）。 */
  ts: number;
};

/** 模型流式 token / 文本片段。 */
export type AgentTokenEvent = AgentEventBase & {
  type: "token";
  /** 本次追加的文本。 */
  text: string;
  /**
   * `reply`：助手正文（默认）；`thinking`：推理 / 思考过程（只进时间线，不进最终 reply）。
   */
  channel?: "reply" | "thinking";
};

/**
 * 运行阶段状态（供 C 端时间线）。
 * `planning`：已接单、尚未进入模型；`thinking`：模型生成中。
 */
export type AgentStatusEvent = AgentEventBase & {
  type: "status";
  status: "planning" | "thinking";
};

/** 工具调用生命周期（开始或结束）。 */
export type AgentToolEvent = AgentEventBase & {
  type: "tool";
  /** `start` 进入工具；`end` 工具返回。 */
  phase: "start" | "end";
  /** 工具名。 */
  name: string;
  /** 与模型 tool_call.id 对齐，便于 UI 合并 start/end。 */
  callId?: string;
  /** 主要路径类参数（若有）。 */
  path?: string;
  /** 一行摘要（查询、模式等）。 */
  summary?: string;
  /** 可选细节（兼容旧字段：ok / error 等）。 */
  detail?: string;
  /** `end` 时是否业务成功。 */
  ok?: boolean;
  /** 文件修改时的 unified diff（`edit_file` / `write_file`）。 */
  diff?: string;
  /** `delete_file` 成功时缓存的正文，供 UI「恢复」。 */
  restoreContent?: string;
  /** 缓存写入时间（Unix ms）；省略时由 renderer 在收到时打戳。 */
  restoreCachedAt?: number;
};

/** 运行成功结束。 */
export type AgentDoneEvent = AgentEventBase & {
  type: "done";
  /** 最终助手回复文本。 */
  text: string;
};

/** 运行失败。 */
export type AgentErrorEvent = AgentEventBase & {
  type: "error";
  /** 错误信息。 */
  error: string;
};

/**
 * 单次模型调用的 token 用量（OpenAI / 兼容网关字段归一化后）。
 * 数值均为非负整数；缺省字段按 0。
 */
export type ModelUsage = {
  /** 输入 tokens（含缓存读写）。 */
  inputTokens: number;
  /** 输出 tokens（含思考）。 */
  outputTokens: number;
  /** 缓存命中（计入 input）。 */
  cacheReadTokens: number;
  /** 缓存写入（计入 input）。 */
  cacheWriteTokens: number;
  /** 思考 / reasoning tokens（计入 output）。 */
  reasoningTokens: number;
};

/** 一次模型调用结束后的用量推送（一轮 run 内可能多条）。 */
export type AgentUsageEvent = AgentEventBase & {
  type: "usage";
  usage: ModelUsage;
};

/** 推送给 UI 的全部 agent 事件联合类型。 */
export type AgentEvent =
  | AgentTokenEvent
  | AgentStatusEvent
  | AgentToolEvent
  | AgentDoneEvent
  | AgentErrorEvent
  | AgentUsageEvent;
