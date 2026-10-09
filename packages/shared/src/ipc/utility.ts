/**
 * Desktop 主进程 ↔ agent utilityProcess 的消息信封。
 * 所有消息固定 `channel: "utility"`，用 `kind` 区分方向与语义；勿与 renderer IPC channel 混淆。
 */

import type { AgentCancelCommand, AgentResumeCommand, AgentRunCommand } from "./commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "./contextUsage";
import type { AgentEvent } from "./events";
import type { WorkspaceAccess } from "./general";
import type { AiLocale } from "./locale";
import type { LogRecord } from "./log";
import type { ModelSettings } from "./settings";

/** 主进程 → 子进程：握手，下发检查点目录与初始模型 / 语言。 */
export type UtilityHello = {
  channel: "utility";
  kind: "hello";
  /** 检查点落盘目录；省略则由子进程使用默认策略。 */
  checkpointDir?: string;
  /** 写入日志 meta 时是否截断长文本。 */
  logTruncateLongContent?: boolean;
  /** 是否产出 agent 日志。 */
  loggingEnabled?: boolean;
  /** 初始模型凭据（完整，仅主进程 / utility）。 */
  model?: ModelSettings;
  /** AI 回复偏好语言。 */
  aiLocale?: AiLocale;
  /** 文件工具工作区外访问档位。 */
  workspaceAccess?: WorkspaceAccess;
  /** 是否允许 AI 删除文件。 */
  allowAiDeleteFiles?: boolean;
  /** 默认工作区根（无 active workspace 时回退）。 */
  workspaceRoot?: string;
  /** 应用数据根（rules / skills 全局目录）。 */
  dataDir?: string;
};

/** 子进程 → 主进程：已就绪，可接受 run / cancel / resume。 */
export type UtilityReady = {
  channel: "utility";
  kind: "ready";
};

/** 主进程 → 子进程：发起一次运行。 */
export type UtilityRun = {
  channel: "utility";
  kind: "run";
  /** 本次运行 id（由主进程分配）。 */
  runId: string;
  /** 线程 id。 */
  threadId: string;
  /** 端到端追踪 id（与 command.traceId 一致，便于子进程早读）。 */
  traceId: string;
  /** 用户消息等运行命令。 */
  command: AgentRunCommand;
  /** 最新模型设置；本轮生效，无需重启进程。 */
  model?: ModelSettings;
  /** 本轮回复偏好语言。 */
  aiLocale?: AiLocale;
  /** 本轮文件工具工作区外访问档位。 */
  workspaceAccess?: WorkspaceAccess;
  /** 本轮是否允许 AI 删除文件。 */
  allowAiDeleteFiles?: boolean;
  /** 本轮起是否截断日志长文本（与通用设置同步）。 */
  logTruncateLongContent?: boolean;
  /** 本轮起是否产出日志（与通用设置同步）。 */
  loggingEnabled?: boolean;
  /** 本轮工作区根。 */
  workspaceRoot?: string;
  /** 本轮数据根（rules / skills）。 */
  dataDir?: string;
};

/** 主进程 → 子进程：取消运行。 */
export type UtilityCancel = {
  channel: "utility";
  kind: "cancel";
  command: AgentCancelCommand;
};

/** 主进程 → 子进程：从中断恢复。 */
export type UtilityResume = {
  channel: "utility";
  kind: "resume";
  /** 与中断对应的运行 id。 */
  runId: string;
  command: AgentResumeCommand;
  /** 本轮工作区根。 */
  workspaceRoot?: string;
  model?: ModelSettings;
  aiLocale?: AiLocale;
  /** 本轮文件工具工作区外访问档位。 */
  workspaceAccess?: WorkspaceAccess;
  /** 本轮是否允许 AI 删除文件。 */
  allowAiDeleteFiles?: boolean;
  /** 本轮数据根（rules / skills）。 */
  dataDir?: string;
};

/** 主进程 → 子进程：估算上下文占用（与 assembleContext 同源）。 */
export type UtilityContextUsage = {
  channel: "utility";
  kind: "contextUsage";
  /** 关联请求 id，响应用同一值回传。 */
  requestId: string;
  request: ContextUsageRequest;
  model?: ModelSettings;
  aiLocale?: AiLocale;
  workspaceAccess?: WorkspaceAccess;
  allowAiDeleteFiles?: boolean;
  workspaceRoot?: string;
  dataDir?: string;
};

/** 子进程 → 主进程：上下文占用估算结果。 */
export type UtilityContextUsageResult = {
  channel: "utility";
  kind: "contextUsageResult";
  requestId: string;
  usage: ContextUsageSnapshot;
};

/** 子进程 → 主进程：转发一条 AgentEvent（再由主进程推给 renderer）。 */
export type UtilityEventMessage = {
  channel: "utility";
  kind: "event";
  event: AgentEvent;
};

/** 子进程 → 主进程：一条关联日志（再由主进程推给 renderer）。 */
export type UtilityLogMessage = {
  channel: "utility";
  kind: "log";
  record: LogRecord;
};

/**
 * 子进程异常退出通知（由主进程侧观察 exit 后构造，不一定经 parentPort）。
 * `code` 为进程退出码；被信号杀死时可能为 null。
 */
export type UtilityCrashNotice = {
  channel: "utility";
  kind: "child-exit";
  code: number | null;
};

/** 主进程发给 utility 子进程的全部消息。 */
export type UtilityToChild =
  | UtilityHello
  | UtilityRun
  | UtilityCancel
  | UtilityResume
  | UtilityContextUsage;

/** utility 子进程发给主进程的全部消息。 */
export type UtilityToParent =
  | UtilityReady
  | UtilityEventMessage
  | UtilityLogMessage
  | UtilityContextUsageResult;
