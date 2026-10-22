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

/** 探索工具结果路径类型（与 list_dir / browser 截图等 UI 标签对齐）。 */
export type ChatTimelineResultPathKind = "dir" | "file" | "link" | "image";

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
  /** 工具返回的路径列表（如 search / list；供探索行展开）。 */
  resultPaths?: string[];
  /** 与 resultPaths 对齐的路径类型标签。 */
  resultPathKinds?: ChatTimelineResultPathKind[];
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
  /** shell 关联终端会话。 */
  sessionId?: string;
  /** shell 命令原文。 */
  command?: string;
  /** 时间线实时输出（UI 截断保留尾部）。 */
  liveOutput?: string;
  /** 退出码（tool end 后）。 */
  exitCode?: number | null;
  /** 是否因 block_until 超时而转后台。 */
  backgrounded?: boolean;
  /**
   * 等待 HITL 审批时挂在 shell 步骤上（如 shell_approval）。
   * 用户选择后清除；拒绝时步骤以失败结束。
   */
  hitl?: {
    hitlId: string;
    title: string;
    body?: string;
    actions: Array<{
      id: string;
      label: string;
      style?: "primary" | "danger" | "ghost";
    }>;
    /** shell_write：原 shell 命令（说明向谁输入）。 */
    parentCommand?: string;
    /** shell_write：将写入的内容预览。 */
    dataPreview?: string;
    /** 这条命令要做什么（研判理由等）；没有则卡片用默认说明。 */
    purpose?: string;
  };
  /**
   * ask_user 澄清题。答复写入 answers 后卡片只读。
   * 与 hitl 分开存，避免会话收束时把已答内容清掉。
   */
  clarify?: {
    hitlId: string;
    questions: Array<{
      id: string;
      prompt: string;
      options: Array<{ id: string; label: string }>;
    }>;
    answers?: Array<{
      id: string;
      optionId?: string;
      text?: string;
    }>;
  };
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

/**
 * 时间线：Auto 故障切换说明（info 行，非硬错误）。
 */
export type ChatTimelineModelSwitchStep = {
  id: string;
  kind: "model_switch";
  fromModelId?: string;
  fromLabel: string;
  toModelId: string;
  toLabel: string;
  reason: "auth" | "not_found" | "rate_limit" | "network" | "server" | "other";
  /** 简短错误摘要。 */
  detail?: string;
};

/** 子代理 Task 卡片时间线。 */
export type ChatTimelineSubagentStep = {
  id: string;
  kind: "subagent";
  taskId: string;
  subagent: string;
  title?: string;
  phase: "started" | "progress" | "finished" | "failed" | "cancelled";
  background?: boolean;
  summary?: string;
  liveLine?: string;
  error?: string;
  entries?: Array<{ ts: number; kind: string; summary: string }>;
  childTimeline?: ChatTimelineStep[];
  active: boolean;
};

/** 助手气泡内嵌的运行时间线条目。 */
export type ChatTimelineStep =
  | ChatTimelineStatusStep
  | ChatTimelineToolStep
  | ChatTimelineTextStep
  | ChatTimelineErrorStep
  | ChatTimelineModelSwitchStep
  | ChatTimelineSubagentStep;

/**
 * 用户消息附图引用（像素在工作空间 images 目录；会话只存元数据）。
 * `path` 为绝对路径，须落在 `{dataDir}/workspaces/{workspaceId}/images/` 下。
 */
export type ChatImageRef = {
  /** 附件唯一 id（亦用于文件名）。 */
  id: string;
  /** 落盘绝对路径。 */
  path: string;
  /** MIME（如 image/png）。 */
  mime: string;
  /** 像素宽。 */
  width: number;
  /** 像素高。 */
  height: number;
};

/** 单条聊天消息（序列化友好，可写入会话快照）。 */
export type ChatMessage = {
  /** 消息唯一 id。 */
  id: string;
  /** 发言角色。 */
  role: Role;
  /** 正文文本。 */
  text: string;
  /** 用户附图（仅 user；全部保留，不截断）。 */
  images?: ChatImageRef[];
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
