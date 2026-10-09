/**
 * Desktop 主进程 ↔ agent utilityProcess 的消息信封。
 * 所有消息固定 `channel: "utility"`，用 `kind` 区分方向与语义；勿与 renderer IPC channel 混淆。
 */

import type { AgentCancelCommand, AgentResumeCommand, AgentRunCommand } from "./commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "./contextUsage";
import type { AgentEvent } from "./events";
import type { ShellApprovalMode, WorkspaceAccess } from "./general";
import type { HitlRequest, HitlResponse } from "./hitl";
import type { AiLocale } from "./locale";
import type { LogRecord } from "./log";
import type { McpServerConfig, McpServerRuntimeStatus } from "./mcp";
import type { ModelSettings } from "./settings";
import type { ShellProfile } from "./terminal";

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
  /** 是否允许 AI shell 工具。 */
  allowAiShell?: boolean;
  /** 是否允许 AI 内置浏览器工具。 */
  allowAiBrowser?: boolean;
  /** 命令行审批模式。 */
  shellApprovalMode?: ShellApprovalMode;
  /** 免审命令白名单。 */
  shellAllowlist?: string[];
  /** 解析后的当前 shell（供 environment_context）。 */
  shell?: ShellProfile;
  /** 默认工作区根（无 active workspace 时回退）。 */
  workspaceRoot?: string;
  /** 应用数据根（rules / skills 全局目录）。 */
  dataDir?: string;
  /** 当前启用的 MCP server 配置快照（engine 不扫盘）。 */
  mcpServers?: McpServerConfig[];
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
  allowAiShell?: boolean;
  allowAiBrowser?: boolean;
  shellApprovalMode?: ShellApprovalMode;
  shellAllowlist?: string[];
  shell?: ShellProfile;
  /** 本轮起是否截断日志长文本（与通用设置同步）。 */
  logTruncateLongContent?: boolean;
  /** 本轮起是否产出日志（与通用设置同步）。 */
  loggingEnabled?: boolean;
  /** 本轮工作区根。 */
  workspaceRoot?: string;
  /** 本轮数据根（rules / skills）。 */
  dataDir?: string;
  /** 本轮 MCP 配置快照（可选；省略则沿用 hello / 上次 reload）。 */
  mcpServers?: McpServerConfig[];
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
  allowAiShell?: boolean;
  allowAiBrowser?: boolean;
  shellApprovalMode?: ShellApprovalMode;
  shellAllowlist?: string[];
  shell?: ShellProfile;
  /** 本轮起是否截断日志长文本（与通用设置同步）。 */
  logTruncateLongContent?: boolean;
  /** 本轮起是否产出日志（与通用设置同步）。 */
  loggingEnabled?: boolean;
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

/** 子进程 → 主进程：一条关联日志（主进程落库并广播给 renderer）。 */
export type UtilityLogMessage = {
  channel: "utility";
  kind: "log";
  record: LogRecord;
};

/** PTY 请求动作。 */
export type PtyRequestAction = "exec" | "await" | "write" | "kill";

/** 子进程 → 主进程：PTY 请求（exec/await/write/kill）。 */
export type UtilityPtyRequest = {
  channel: "utility";
  kind: "ptyRequest";
  requestId: string;
  action: PtyRequestAction;
  /** exec：命令行；write：stdin 文本。 */
  command?: string;
  workingDirectory?: string;
  blockUntilMs?: number;
  sessionId?: string;
  /** await 时可选：stdout 匹配则提前返回。 */
  pattern?: string;
  data?: string;
  cols?: number;
  rows?: number;
  runId?: string;
  threadId?: string;
};

/** 主进程 → 子进程：PTY 流式/结果事件。 */
export type UtilityPtyEvent = {
  channel: "utility";
  kind: "ptyEvent";
  requestId: string;
  phase: "data" | "exit" | "result" | "error";
  sessionId?: string;
  data?: string;
  exitCode?: number | null;
  backgrounded?: boolean;
  output?: string;
  error?: string;
};

/** 内置浏览器 agent 请求动作。 */
export type BrowserRequestAction =
  | "navigate"
  | "lock"
  | "unlock"
  | "snapshot"
  | "click"
  | "type"
  | "fill"
  | "pressKey"
  | "scroll"
  | "evaluate"
  | "resize"
  | "getStyles"
  | "screenshot";

/** 子进程 → 主进程：浏览器自动化请求。 */
export type UtilityBrowserRequest = {
  channel: "utility";
  kind: "browserRequest";
  requestId: string;
  action: BrowserRequestAction;
  url?: string;
  /** navigate 时是否要求 UI 打开右侧 Browser 面板。 */
  reveal?: boolean;
  ref?: string;
  element?: string;
  text?: string;
  value?: string;
  key?: string;
  script?: string;
  selector?: string;
  properties?: string[];
  width?: number;
  height?: number;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  scrollIntoView?: boolean;
  doubleClick?: boolean;
  button?: "left" | "right" | "middle";
  takeScreenshotAfterwards?: boolean;
  runId?: string;
  threadId?: string;
};

/** 主进程 → 子进程：浏览器自动化结果。 */
export type UtilityBrowserEvent = {
  channel: "utility";
  kind: "browserEvent";
  requestId: string;
  phase: "result" | "error";
  output?: string;
  error?: string;
  /** 截图本地路径（若有）。 */
  screenshotPath?: string;
};

/** 子进程 → 主进程：发起 HITL（再由主进程推 UI / 通知）。 */
export type UtilityHitlRequestMessage = {
  channel: "utility";
  kind: "hitl";
  request: HitlRequest;
};

/** 主进程 → 子进程：HITL 用户答复。 */
export type UtilityHitlResult = {
  channel: "utility";
  kind: "hitlResult";
  response: HitlResponse;
};

/** 主进程 → 子进程：热重载 MCP 配置快照。 */
export type UtilityMcpReload = {
  channel: "utility";
  kind: "mcpReload";
  mcpServers: McpServerConfig[];
};

/** 子进程 → 主进程：单个 MCP server 运行时状态。 */
export type UtilityMcpStatus = {
  channel: "utility";
  kind: "mcpStatus";
  status: McpServerRuntimeStatus;
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
  | UtilityContextUsage
  | UtilityPtyEvent
  | UtilityBrowserEvent
  | UtilityHitlResult
  | UtilityMcpReload;

/** utility 子进程发给主进程的全部消息。 */
export type UtilityToParent =
  | UtilityReady
  | UtilityEventMessage
  | UtilityLogMessage
  | UtilityContextUsageResult
  | UtilityPtyRequest
  | UtilityBrowserRequest
  | UtilityHitlRequestMessage
  | UtilityMcpStatus;
