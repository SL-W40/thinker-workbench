/**
 * Desktop 主进程 ↔ agent utilityProcess 的消息信封。
 * 所有消息固定 `channel: "utility"`，用 `kind` 区分方向与语义；勿与 renderer IPC channel 混淆。
 */

import type { ChatTodo } from "../protocol/todo";
import type { SubagentDefinition } from "./agents";
import type { ChatMode } from "./chatMode";
import type {
  AgentCancelCommand,
  AgentCancelTaskCommand,
  AgentResumeCommand,
  AgentRunCommand,
} from "./commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "./contextUsage";
import type { AgentEvent } from "./events";
import type { HttpCompatibilityMode, ShellApprovalMode, WorkspaceAccess } from "./general";
import type { HitlRequest, HitlResponse } from "./hitl";
import type { AiLocale } from "./locale";
import type { LogRecord } from "./log";
import type { McpServerConfig, McpServerRuntimeStatus } from "./mcp";
import type { ModelCatalog, ModelSelection } from "./settings";
import type { ShellProfile } from "./terminal";
import type { TraceSettings, TraceSpanMessage } from "./trace";

/**
 * hello / run / resume 共用的「运行时设置」字段块（单一可信源）。
 * 三处消息用交集引入；字段保持 optional，匹配「主进程可省略、engine 侧有默认」的现状。
 * 新增运行时字段时：同时加到此类型与 `RuntimeSettingsSnapshot`，并在 `buildRuntimeSettings` 补齐。
 */
export type UtilityRuntimeSettings = {
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
  /** 命令首 token 硬拒绝名单。 */
  shellBlocklist?: string[];
  /** 解析后的当前 shell（供 environment_context）。 */
  shell?: ShellProfile;
  /** 模型 HTTP 兼容模式。 */
  httpCompatibilityMode?: HttpCompatibilityMode;
  /** 主会话最大执行步数（LangGraph superstep）。 */
  maxAgentSteps?: number;
  /** Task / 子代理最大执行步数。 */
  maxSubagentSteps?: number;
  /** 模型重试次数（含首次）。 */
  modelRetryMaxAttempts?: number;
  /** 模型重试基础延迟（ms）。 */
  modelRetryBaseDelayMs?: number;
  /** 串行工具最小间隔（ms）；0 表示不强制。 */
  toolCallMinGapMs?: number;
  /** shell 默认 block_until_ms。 */
  defaultShellBlockUntilMs?: number;
  /** shell 输出截断上限。 */
  shellOutputCap?: number;
  /** MCP 连接超时（ms）。 */
  mcpConnectTimeoutMs?: number;
  /** MCP 调用超时（ms）。 */
  mcpCallTimeoutMs?: number;
  /** `@` 单文件最大字节。 */
  contextFilesMaxFileBytes?: number;
  /** `@` 合计最大字节。 */
  contextFilesMaxTotalBytes?: number;
  /** read_file 默认 max_chars。 */
  readFileDefaultMaxChars?: number;
  /** 是否产出 agent 控制台日志。 */
  loggingEnabled?: boolean;
  /** 本机 Trace 采集。 */
  trace?: TraceSettings;
};

/**
 * 运行时设置全必填快照：`buildRuntimeSettings` 的返回类型。
 * 与 `UtilityRuntimeSettings` 同字段但全部 required——新增字段时若 builder 漏填，编译器即报错。
 */
export type RuntimeSettingsSnapshot = Required<UtilityRuntimeSettings>;

/** 主进程 → 子进程：握手，下发初始模型 / 语言（检查点目录随 run / resume 按工作区下发）。 */
export type UtilityHello = {
  channel: "utility";
  kind: "hello";
  /** 完整模型目录（含明文 key）。 */
  catalog?: ModelCatalog;
  /** 本轮生效的选用（会话覆盖或全局）。 */
  selection?: ModelSelection;
  /** 默认工作区根（无 active workspace 时回退）。 */
  workspaceRoot?: string;
  /** 应用数据根（rules / skills 全局目录）。 */
  dataDir?: string;
  /** 当前启用的 MCP server 配置快照（engine 不扫盘）。 */
  mcpServers?: McpServerConfig[];
  /** 可见子代理定义（Customize / Task 工具）。 */
  subagents?: SubagentDefinition[];
} & UtilityRuntimeSettings;

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
  /** 聊天会话 id（Trace 索引键）。 */
  sessionId?: string;
  /** 工作空间 id（Trace 会话元数据）。 */
  workspaceId?: string;
  /** 本轮检查点目录（`<dataDir>/workspaces/<id>/checkpoints`）。 */
  checkpointDir?: string;
  /** 会话标题（Trace 列表展示）。 */
  sessionTitle?: string;
  /** 会话既有待办：run 开始时播种进本次 run，供 todo / create_plan 读写。 */
  sessionTodos?: ChatTodo[];
  /** 用户消息等运行命令。 */
  command: AgentRunCommand;
  /**
   * 本次 run 在主进程排队等待被调度的时长（毫秒）。
   * 由主进程账本（commit → promote）计算，engine 会把它并入终态 `durationMs`。
   */
  queuedMs?: number;
  /** 完整模型目录（含明文 key）。 */
  catalog?: ModelCatalog;
  /** 本轮生效的选用。 */
  selection?: ModelSelection;
  /** 本轮 ChatMode。 */
  chatMode?: ChatMode;
  /** 本轮工作区根。 */
  workspaceRoot?: string;
  /** 本轮数据根（rules / skills）。 */
  dataDir?: string;
  /** 本轮 MCP 配置快照（可选；省略则沿用 hello / 上次 reload）。 */
  mcpServers?: McpServerConfig[];
  /** 本轮子代理定义快照（可选；省略则沿用 hello）。 */
  subagents?: SubagentDefinition[];
} & UtilityRuntimeSettings;

/** 主进程 → 子进程：取消运行。 */
export type UtilityCancel = {
  channel: "utility";
  kind: "cancel";
  command: AgentCancelCommand;
};

/** 主进程 → 子进程：取消单个后台 Task。 */
export type UtilityCancelTask = {
  channel: "utility";
  kind: "cancelTask";
  command: AgentCancelTaskCommand;
};

/** 主进程 → 子进程：从中断恢复。 */
export type UtilityResume = {
  channel: "utility";
  kind: "resume";
  /** 与中断对应的运行 id。 */
  runId: string;
  command: AgentResumeCommand;
  /** 聊天会话 id（Trace 索引键）。 */
  sessionId?: string;
  /** 工作空间 id（Trace 会话元数据）。 */
  workspaceId?: string;
  /** 本轮检查点目录（`<dataDir>/workspaces/<id>/checkpoints`）。 */
  checkpointDir?: string;
  /** 会话标题（Trace 列表展示）。 */
  sessionTitle?: string;
  /** 会话既有待办：恢复时同样播种，保证待办不因续跑丢失。 */
  sessionTodos?: ChatTodo[];
  /** 本轮工作区根。 */
  workspaceRoot?: string;
  catalog?: ModelCatalog;
  selection?: ModelSelection;
  /** 本轮 ChatMode。 */
  chatMode?: ChatMode;
  /** 本轮数据根（rules / skills）。 */
  dataDir?: string;
  /** 本轮子代理定义快照（可选；省略则沿用 hello）。 */
  subagents?: SubagentDefinition[];
} & UtilityRuntimeSettings;

/** 主进程 → 子进程：估算上下文占用（与 assembleContext 同源）。 */
export type UtilityContextUsage = {
  channel: "utility";
  kind: "contextUsage";
  /** 关联请求 id，响应用同一值回传。 */
  requestId: string;
  request: ContextUsageRequest;
  catalog?: ModelCatalog;
  selection?: ModelSelection;
  aiLocale?: AiLocale;
  workspaceAccess?: WorkspaceAccess;
  allowAiDeleteFiles?: boolean;
  workspaceRoot?: string;
  dataDir?: string;
  /**
   * 主进程按生效选用解析出的上下文窗口。
   * 估算走「不解锁密钥」的快照路径，子进程拿不到明文 apiKey，
   * 故窗口必须由主进程下发，否则会回退默认 128K。
   */
  contextWindow?: number;
  /** 主进程解析的 emoji 偏好；防止被 configureChatModel 覆盖成 false。 */
  allowEmoji?: boolean;
  /** 会话级 ChatMode，保证 mode 段与工具清单与真实请求一致。 */
  chatMode?: ChatMode;
};

/** 子进程 → 主进程：上下文占用估算结果。 */
export type UtilityContextUsageResult = {
  channel: "utility";
  kind: "contextUsageResult";
  requestId: string;
  usage: ContextUsageSnapshot;
};

/** 主进程 → 子进程：清理某会话线程的全部 checkpoint（真实存储在子进程内）。 */
export type UtilityCheckpointClear = {
  channel: "utility";
  kind: "checkpointClear";
  /** 关联请求 id，响应用同一值回传。 */
  requestId: string;
  /** 会话线程 id（按其 run 级线程键前缀清理）。 */
  threadId: string;
};

/** 子进程 → 主进程：checkpoint 清理结果（best-effort，失败带原因）。 */
export type UtilityCheckpointClearResult = {
  channel: "utility";
  kind: "checkpointClearResult";
  requestId: string;
  ok: boolean;
  error?: string;
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

/** shell 执行模式（已解析；auto 在 engine 侧展开）。 */
export type PtyExecMode = "login" | "direct";

/** shell 工具 outcome。 */
export type PtyShellOutcome = "complete" | "still_running";

/** shell 等待唤醒原因。 */
export type PtyWakeReason = "exit" | "timeout" | "pattern" | "background";

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
  /** exec：是否在本次调用内 wait（false = 立刻 still_running）。 */
  await?: boolean;
  /** exec：已解析的 login | direct。 */
  execMode?: PtyExecMode;
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
  /** 兼容旧字段：outcome === still_running。 */
  backgrounded?: boolean;
  outcome?: PtyShellOutcome;
  wakeReason?: PtyWakeReason;
  output?: string;
  outputPath?: string;
  outputBytes?: number;
  outputTruncated?: boolean;
  execMode?: PtyExecMode;
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

/** 子进程 → 主进程：Git 只读检视请求（Git 二进制只在主进程可用）。 */
export type UtilityGitRequest = {
  channel: "utility";
  kind: "gitRequest";
  requestId: string;
  action: GitRequestAction;
  /** 目标工作空间 id；省略时主进程按 threadId 反查工作区。 */
  workspaceId?: string;
  /** 发起请求的 run / thread，用于宿主侧日志归属。 */
  runId?: string;
  threadId?: string;
  /** git_diff 的目标路径过滤；省略表示全部改动。 */
  paths?: string[];
  /** unified diff 上下文行数；省略取默认 3。 */
  contextLines?: number;
  /** 输出字符上限（截断保护）；省略取 shellOutputCap。 */
  maxChars?: number;
};

/** Git 只读请求动作（写操作不在其中，避免给模型开写权限）。 */
export type GitRequestAction = "status" | "diff";

/** 主进程 → 子进程：Git 只读检视结果。 */
export type UtilityGitResult = {
  channel: "utility";
  kind: "gitResult";
  requestId: string;
  phase: GitResultPhase;
  /** status / diff 的纯文本结果（已做面向模型的压缩排版与截断）。 */
  output?: string;
  error?: string;
  /** 是否因 maxChars 截断。 */
  truncated?: boolean;
};

/** Git 结果阶段：先 `data` 再 `result`/`error`，保证客户端总能收到终态。 */
export type GitResultPhase = "data" | "result" | "error";

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
  | UtilityCancelTask
  | UtilityResume
  | UtilityContextUsage
  | UtilityCheckpointClear
  | UtilityPtyEvent
  | UtilityBrowserEvent
  | UtilityHitlResult
  | UtilityGitResult
  | UtilityMcpReload;

/** utility 子进程发给主进程的全部消息。 */
export type UtilityToParent =
  | UtilityReady
  | UtilityEventMessage
  | UtilityLogMessage
  | UtilityContextUsageResult
  | UtilityCheckpointClearResult
  | UtilityPtyRequest
  | UtilityBrowserRequest
  | UtilityHitlRequestMessage
  | UtilityGitRequest
  | UtilityMcpStatus
  | TraceSpanMessage;
