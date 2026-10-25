/**
 * 聊天消息协议类型。
 * 描述 UI / renderer 侧展示的一条对话消息形状（与 agent 运行结果解耦）。
 */

import type { ChatMode } from "../ipc/chatMode";
import type { ModelUsage } from "../ipc/events";
// 类型循环（todo.ts 也引用 ChatPlanTodo）仅用于类型层面，编译后不存在
import type { ChatTimelineTodoHint } from "./todo";

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
  /** 工具开始时间（Unix ms；尾部暂留的最小展示时长用）。 */
  startedAt?: number;
  /** 工具结束时间（Unix ms）。 */
  endedAt?: number;
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
  /** `todo` 工具：动作与受影响条目（区分读 / 写）。 */
  todo?: ChatTimelineTodoHint;
  /** `update_plan` 工具：这次更新动了哪几步（一行说清「更新了啥」）。 */
  planUpdate?: ChatPlanUpdateHint;
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
   * request_mode_switch：等用户确认切换 ChatMode 时挂在步骤上。
   * 与 hitl 分开存，`resolvedAction` 记下用户选了切换还是保持，答复后卡片转只读。
   */
  modeSwitch?: {
    hitlId: string;
    /** 要切到的模式。 */
    targetMode: ChatMode;
    /** 发起时的模式。 */
    currentMode: ChatMode;
    /** 模型给出的切换理由。 */
    reason?: string;
    /** 用户答复：switch / stay（缺省表示还没答）。 */
    resolvedAction?: string;
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
      /** 是否必答；缺省（或 true）必答，false 时 UI 允许跳过。 */
      required?: boolean;
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
 * 时间线：承上启下小结行。
 * 模型在调工具前、确有关键结论 / 思维转变 / 用户须知时，
 * 以 `[NEXT] 一句话` 标记行主动给出；renderer 解析标记后落为本步骤，
 * 并把标记行从回复正文里剥离。没有转折时模型不写，本步骤不出现。
 */
export type ChatTimelineTransitionStep = {
  id: string;
  kind: "transition";
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
  | ChatTimelineTransitionStep
  | ChatTimelineErrorStep
  | ChatTimelineModelSwitchStep
  | ChatTimelineSubagentStep;

/**
 * 用户消息附图引用（像素在工作空间 images 目录或外部图片附件 attachments 目录；会话只存元数据）。
 * `path` 为绝对路径，须落在 `{dataDir}/workspaces/{workspaceId}/images/` 或 `.../attachments/` 下。
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

/**
 * 外部附件（工作空间外文件，经上传/粘贴/拖拽落盘到 dataDir/attachments）的语义种类。
 * - image/audio/video：媒体，沿用既有预览通道
 * - document：结构化文档（pdf/doc/docx/xls…），走可插拔解析层抽文本
 * - other：其它二进制
 */
export type AttachmentKind = "image" | "audio" | "video" | "document" | "other";

/** 外部附件引用（落盘绝对路径 + 元数据；会话只存元数据，不污染 workspace）。 */
export type ChatAttachmentRef = {
  /** 附件唯一 id（亦作文件名）。 */
  id: string;
  /** 原始文件名（含扩展名）。 */
  name: string;
  /** 落盘绝对路径（dataDir/workspaces/{wsId}/attachments 下）。 */
  path: string;
  /** MIME（如 application/pdf）。 */
  mime: string;
  /** 字节大小。 */
  size: number;
  /** 语义种类。 */
  kind: AttachmentKind;
};

/** 计划完成状态。 */
export type ChatPlanStatus = "draft" | "ready" | "building" | "done";

/** 单条待办的状态。 */
export type ChatPlanTodoStatus = "pending" | "in_progress" | "done";

/** 计划里的一条待办。 */
export type ChatPlanTodo = {
  /** 稳定 id（执行时按 id 定位更新，不要按下标）。 */
  id: string;
  /** 待办描述。 */
  label: string;
  /** 完成状态。 */
  status: ChatPlanTodoStatus;
};

/**
 * `update_plan` 单次调用的变更摘要。
 *
 * 计划列表是全量替换，光看「更新计划」看不出改了哪：这里给进度 + 逐项变化
 * （文案已截断、每类最多几条，供时间线一行展示）。
 */
export type ChatPlanUpdateHint = {
  /** 更新后的步骤总数。 */
  total: number;
  /** 其中已完成的数量。 */
  done: number;
  /** 本次变为完成的步骤文案。 */
  completed?: string[];
  /** 本次新增的步骤文案。 */
  added?: string[];
  /** 本次删除的步骤文案。 */
  removed?: string[];
  /** 本次从完成退回未完成的步骤文案。 */
  reopened?: string[];
};

/**
 * 计划文档（plan.md）的结构化内容，是权威数据源。
 *
 * 默认不落用户工作空间，随会话快照持久化；
 * plan.md 文本只是它的渲染投影，消费端不反解文本取真值。
 */
export type ChatPlan = {
  /** 计划 id（稳定，供右侧面板虚拟标签寻址）。 */
  id: string;
  /** 计划标题（由 create_plan 工具给出；缺省由 UI 兜底）。 */
  title?: string;
  /** 计划简述（卡片上一句话说明要做什么）。 */
  description?: string;
  /** 计划完成状态。 */
  status: ChatPlanStatus;
  /** 待办列表（数组顺序即展示顺序）。 */
  todos: ChatPlanTodo[];
  /** 计划全文（由 create_plan 工具给出的 markdown 正文）。 */
  markdown: string;
  /** 创建时间（Unix ms）。 */
  createdAt?: number;
  /** 最近更新时间（Unix ms）。 */
  updatedAt?: number;
};

/** 单条聊天消息（序列化友好，可写入会话快照）。 */
export type ChatMessage = {
  /** 消息唯一 id。 */
  id: string;
  /** 发言角色。 */
  role: Role;
  /** 正文文本。 */
  text: string;
  /**
   * 本轮产出的计划文档（仅 assistant；plan 模式生成，执行阶段增量更新）。
   * 会话级活跃计划取「最后一条带 plan 的消息」，新计划自然覆盖旧计划。
   */
  plan?: ChatPlan;
  /** 用户附图（仅 user；全部保留，不截断）。 */
  images?: ChatImageRef[];
  /** 外部附件引用（仅 user；工作空间外文件，经 @file:<id> 引用）。 */
  attachments?: ChatAttachmentRef[];
  /** 消息在 UI 中创建时的 Unix 毫秒时间戳。 */
  createdAt?: number;
  /** 为 true 表示仍在流式生成 / 等待完成，尚未定稿。 */
  pending?: boolean;
  /** 本轮助手回复关联的运行时间线（规划 / 思考 / 工具）。 */
  timeline?: ChatTimelineStep[];
  /** 本轮模型 token 用量（多步 agent 会累加）。 */
  usage?: ModelUsage;
  /** true 表示 `usage` 中含粗估成分（网关未回 usage，或中断时按已流出正文补算）。 */
  usageEstimated?: boolean;
  /** 本轮总耗时（ms）；结束后写入。 */
  durationMs?: number;
  /** 本轮开始时间；pending 时用于 live 耗时。 */
  runStartedAt?: number;
  /** 本轮端到端追踪 id（与日志 / agent 共用，便于跳转 Logs）。 */
  traceId?: string;
};
