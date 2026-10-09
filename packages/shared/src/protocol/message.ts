/**
 * 聊天消息协议类型。
 * 描述 UI / renderer 侧展示的一条对话消息形状（与 agent 运行结果解耦）。
 */

import type { ModelUsage } from "../ipc/events";

/** 消息角色：用户、助手或系统。 */
export type Role = "user" | "assistant" | "system";

export type { ModelUsage };

/** 时间线：规划 / 思考状态行。 */
export type ChatTimelineStatusStep = {
  id: string;
  kind: "status";
  status: "planning" | "thinking";
  /** 仍为当前活动阶段时为 true（可显示动效）。 */
  active: boolean;
  /** 思考过程正文（流式累积；planning 一般为空）。 */
  text?: string;
  /**
   * 折叠时展示的短摘要（结论 + 下一步）。
   * 由 UI 侧从 `text` 抽取，随思考流式更新。
   */
  summary?: string;
  /** 本段开始时间（Unix ms），用于计算思考耗时。 */
  startedAt?: number;
  /** 结束后的耗时（ms）；结束后展示 Thought 1s 等。 */
  durationMs?: number;
};

/** 时间线：工具调用行（可含文件 diff）。 */
export type ChatTimelineToolStep = {
  id: string;
  kind: "tool";
  name: string;
  callId?: string;
  path?: string;
  summary?: string;
  phase: "start" | "end";
  ok?: boolean;
  diff?: string;
  /**
   * `delete_file` 成功时缓存的正文，供时间线「恢复」写回。
   * 恢复后或超过设置 TTL 后清空；目录 / 过大文件可能无此字段。
   */
  restoreContent?: string;
  /** 缓存写入时间（Unix ms）；与设置 `deleteFileRestoreTtlDays` 一起判定是否过期。 */
  restoreCachedAt?: number;
  /** 已通过时间线「恢复」写回（与 restoreContent 互斥）。 */
  restored?: boolean;
  active: boolean;
};

/**
 * 时间线：助手对用户可见的叙述正文（reply 频道）。
 * 按事件顺序插在思考 / 工具之间，避免整段堆在时间线末尾。
 */
export type ChatTimelineTextStep = {
  id: string;
  kind: "text";
  text: string;
};

/**
 * 时间线：本轮错误或手动停止（`CANCELLED` 可继续）。
 * 展示在助手气泡时间线内，不再单独发 System 消息。
 */
export type ChatTimelineErrorStep = {
  id: string;
  kind: "error";
  /** 机器可读码，如 `MODEL_API_KEY_MISSING` / `CANCELLED` / `NETWORK`。 */
  code?: string;
  /** 错误正文（固定格式展示）。 */
  message: string;
};

/** 助手气泡内嵌的运行时间线条目。 */
export type ChatTimelineStep =
  | ChatTimelineStatusStep
  | ChatTimelineToolStep
  | ChatTimelineTextStep
  | ChatTimelineErrorStep;

/** 单条聊天消息（序列化友好，可写入会话快照）。 */
export type ChatMessage = {
  /** 消息唯一 id。 */
  id: string;
  /** 发言角色。 */
  role: Role;
  /** 正文文本。 */
  text: string;
  /** 消息在 UI 中创建时的 Unix 毫秒时间戳。 */
  createdAt?: number;
  /** 为 true 表示仍在流式生成 / 等待完成，尚未定稿。 */
  pending?: boolean;
  /** 本轮助手回复关联的运行时间线（规划 / 思考 / 工具）。 */
  timeline?: ChatTimelineStep[];
  /** 本轮模型 token 用量（多步 agent 会累加）。 */
  usage?: ModelUsage;
  /** 本轮总耗时（ms）；结束后写入。 */
  durationMs?: number;
  /** 本轮开始时间；pending 时用于 live 耗时。 */
  runStartedAt?: number;
  /** 本轮端到端追踪 id（与日志 / agent 共用，便于跳转 Logs）。 */
  traceId?: string;
};
