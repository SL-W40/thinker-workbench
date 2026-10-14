/**
 * `@thinker-workbench/shared` 包对外导出面。
 * 聚合 id、IPC 通道 / 命令 / 事件、utility 信封、设置与协议类型，供 app / desktop / agent 共用。
 */

export {
  BROWSER_ABOUT_BLANK,
  browserUrlsEqual,
  normalizeBrowserUrl,
} from "./browser/url";
export { estimateTokens } from "./estimateTokens";
export { parseYamlFrontmatter, parseYamlObject, type YamlFrontmatter } from "./frontmatter";
export {
  createId,
  createRunId,
  createSessionId,
  createSpanId,
  createThreadId,
  createTraceId,
  createWorkspaceId,
} from "./ids";
export type {
  SubagentDefinition,
  SubagentListResult,
  SubagentUpsertInput,
  ThinkerAgentsApi,
} from "./ipc/agents";
export type {
  BrowserBounds,
  BrowserEvent,
  BrowserScreenshotPreview,
  BrowserState,
  ThinkerBrowserApi,
} from "./ipc/browser";
export { type IpcChannel, IpcChannels } from "./ipc/channels";
export type { ChatMode } from "./ipc/chatMode";
export {
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  isChatMode,
  normalizeChatMode,
} from "./ipc/chatMode";
export type {
  AgentCancelCommand,
  AgentCancelTaskCommand,
  AgentHistoryMessage,
  AgentResumeCommand,
  AgentRunCommand,
} from "./ipc/commands";
export type {
  ContextUsageRequest,
  ContextUsageSegment,
  ContextUsageSegmentId,
  ContextUsageSnapshot,
} from "./ipc/contextUsage";
export {
  DEFAULT_CONTEXT_WINDOW,
  emptyContextUsageSnapshot,
} from "./ipc/contextUsage";
export type {
  CustomizeScope,
  CustomizeSource,
} from "./ipc/customize";
export {
  customizeScopeKey,
  normalizeCustomizeScope,
} from "./ipc/customize";
export type {
  CustomThemeExport,
  CustomThemeMermaid,
  CustomThemeRecord,
  CustomThemeSnapshot,
} from "./ipc/customTheme";
export {
  CUSTOM_THEME_FORMAT,
  CUSTOM_THEME_ID_PREFIX,
  createCustomThemeId,
  isCustomThemeId,
  MAX_CUSTOM_THEMES,
  normalizeCustomThemeSnapshot,
  normalizeCustomThemes,
  parseCustomThemeExport,
  toCustomThemeExport,
} from "./ipc/customTheme";
export type {
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateItem,
  DataDirMigrateProgress,
  DataDirPaths,
} from "./ipc/dataDir";
export type {
  AgentDoneEvent,
  AgentErrorCode,
  AgentErrorEvent,
  AgentEvent,
  AgentEventBase,
  AgentHitlEvent,
  AgentModelHealthEvent,
  AgentModelSwitchEvent,
  AgentStatusEvent,
  AgentSubagentEvent,
  AgentTokenEvent,
  AgentToolEvent,
  AgentUsageEvent,
  ModelUsage,
  SubagentChildEvent,
  SubagentTimelineEntry,
} from "./ipc/events";
export type {
  AppFontScale,
  AppThemeBaseId,
  AppThemeCreativeId,
  AppThemeId,
  AppVisualThemeId,
  AttentionPreviewKind,
  BuiltinAppThemeId,
  GeneralSettings,
  HttpCompatibilityMode,
  ShellApprovalMode,
  ThinkerGeneralApi,
  WorkspaceAccess,
} from "./ipc/general";
export {
  APP_FONT_SCALE_IDS,
  APP_THEME_BASE_IDS,
  APP_THEME_CREATIVE_IDS,
  APP_THEME_IDS,
  DEFAULT_APP_FONT_SCALE,
  DEFAULT_APP_THEME,
  DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
  DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
  DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_HTTP_COMPATIBILITY_MODE,
  DEFAULT_MAX_AGENT_STEPS,
  DEFAULT_MAX_PARALLEL_RUNS,
  DEFAULT_MAX_QUEUED_RUNS,
  DEFAULT_MAX_SUBAGENT_STEPS,
  DEFAULT_MCP_CALL_TIMEOUT_MS,
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MODEL_RETRY_BASE_DELAY_MS,
  DEFAULT_MODEL_RETRY_MAX_ATTEMPTS,
  DEFAULT_QUEUE_TIMEOUT_MIN,
  DEFAULT_READ_FILE_MAX_CHARS,
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_SHELL_BLOCK_UNTIL_MS,
  DEFAULT_SHELL_BLOCKLIST,
  DEFAULT_SHELL_OUTPUT_CAP,
  DEFAULT_WORKSPACE_ACCESS,
  DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
  HTTP_COMPATIBILITY_MODES,
  isBuiltinAppTheme,
  isShellTokenBlocked,
  LOG_RETENTION_DAY_OPTIONS,
  MAX_PARALLEL_RUNS_OPTIONS,
  MAX_QUEUED_RUNS_OPTIONS,
  migrateAppThemeFromCatalogV1,
  normalizeAppFontScale,
  normalizeAppTheme,
  normalizeContextFilesMaxFileBytes,
  normalizeContextFilesMaxTotalBytes,
  normalizeDefaultShellBlockUntilMs,
  normalizeDeleteFileRestoreTtlDays,
  normalizeGeneral,
  normalizeHttpCompatibilityMode,
  normalizeIntInRange,
  normalizeMaxAgentSteps,
  normalizeMaxParallelRuns,
  normalizeMaxQueuedRuns,
  normalizeMaxSubagentSteps,
  normalizeMcpCallTimeoutMs,
  normalizeMcpConnectTimeoutMs,
  normalizeModelRetryBaseDelayMs,
  normalizeModelRetryMaxAttempts,
  normalizeOptionalPath,
  normalizeQueueTimeoutMin,
  normalizeReadFileDefaultMaxChars,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeShellBlocklist,
  normalizeShellOutputCap,
  normalizeShellProfileId,
  normalizeUiTheme,
  normalizeWorkspaceAccess,
  QUEUE_TIMEOUT_MIN_OPTIONS,
  resolveVisualThemeId,
  SHELL_APPROVAL_MODES,
  shellAllowlistWithoutBlocked,
  shellCommandBaseToken,
  THEME_CATALOG_VERSION,
  WORKSPACE_ACCESS_OPTIONS,
} from "./ipc/general";
export type { HitlAction, HitlKind, HitlRequest, HitlResponse } from "./ipc/hitl";
export type { AiLocale, AppLocale } from "./ipc/locale";
export {
  AI_LOCALES,
  APP_LOCALES,
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  isAiLocale,
  isAppLocale,
  normalizeAiLocale,
  normalizeAppLocale,
} from "./ipc/locale";
export type { LogLevel, LogRecord, LogSource } from "./ipc/log";
export type {
  McpImportConflict,
  McpListResult,
  McpServerConfig,
  McpServerRuntimeState,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
  McpToolSummary,
  McpTransport,
  ThinkerMcpApi,
} from "./ipc/mcp";
export type {
  RuleListItem,
  RuleListResult,
  RuleUpsertInput,
  ThinkerRulesApi,
} from "./ipc/rules";
export type {
  PageStackSnapshot,
  ThinkerSessionApi,
  UiSessionSnapshot,
} from "./ipc/session";
export type {
  ModelCatalog,
  ModelCatalogPatch,
  ModelCatalogPublic,
  ModelEntry,
  ModelHealth,
  ModelProbeRequest,
  ModelProbeResult,
  ModelProvider,
  ModelProviderPublic,
  ModelSelection,
  ModelSettings,
  ModelSwitchReason,
  ModelTag,
  ThinkerSettingsApi,
  UnlockModelSecretsRequest,
  UnlockModelSecretsResult,
} from "./ipc/settings";
export {
  apiKeyHint,
  buildModelCandidates,
  classifyModelSwitchReason,
  emptyModelCatalog,
  MODEL_TAGS,
  migrateLegacyModelSettings,
  normalizeModelSelection,
  normalizeModelTags,
  resolveModelSettings,
  routeModelTag,
  toPublicModelCatalog,
} from "./ipc/settings";
export type {
  ShortcutGroup,
  ShortcutId,
  ShortcutInfo,
  ShortcutsMap,
  ThinkerShortcutsApi,
} from "./ipc/shortcuts";
export {
  acceleratorFromKeyboardEvent,
  DEFAULT_SHORTCUTS,
  findShortcutConflict,
  formatAcceleratorLabel,
  getDefaultShortcuts,
  MAIN_PROCESS_SHORTCUTS,
  matchAccelerator,
  normalizeAccelerator,
  normalizeShortcuts,
  processPlatform,
  SHORTCUT_CATALOG,
  SHORTCUT_GROUPS,
} from "./ipc/shortcuts";
export type {
  SkillListItem,
  SkillListResult,
  SkillUpsertInput,
  ThinkerSkillsApi,
} from "./ipc/skills";
export type {
  ShellProfile,
  ShellWakeReason,
  TerminalEvent,
  TerminalSession,
  TerminalSessionStatus,
  ThinkerTerminalApi,
} from "./ipc/terminal";
export type {
  LogFileInfo,
  LogsQuery,
  LogsResponse,
  ThinkerToolsApi,
  TraceSummary,
} from "./ipc/tools";
export type {
  ThinkerTraceApi,
  TraceCaptureBinary,
  TraceEndSpanRequest,
  TraceListSessionsQuery,
  TracePayloadRecord,
  TracePayloadSide,
  TraceSessionSummary,
  TraceSource,
  TraceSpanKind,
  TraceSpanMessage,
  TraceSpanRecord,
  TraceSpanStartMessage,
  TraceSpanStatus,
  TraceStartSpanRequest,
} from "./ipc/trace";
export {
  DEFAULT_TRACE_MAX_FIELD_BYTES,
  DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
  DEFAULT_TRACE_MAX_MESSAGE_CHARS,
  DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
  DEFAULT_TRACE_MAX_SESSIONS,
  DEFAULT_TRACE_MAX_TOTAL_BYTES,
  DEFAULT_TRACE_REDACT_KEYS,
  DEFAULT_TRACE_RETENTION_DAYS,
} from "./ipc/trace";
export type {
  BrowserRequestAction,
  PtyExecMode,
  PtyRequestAction,
  PtyShellOutcome,
  PtyWakeReason,
  UtilityBrowserEvent,
  UtilityBrowserRequest,
  UtilityCancel,
  UtilityCancelTask,
  UtilityContextUsage,
  UtilityContextUsageResult,
  UtilityCrashNotice,
  UtilityEventMessage,
  UtilityHello,
  UtilityHitlRequestMessage,
  UtilityHitlResult,
  UtilityLogMessage,
  UtilityMcpReload,
  UtilityMcpStatus,
  UtilityPtyEvent,
  UtilityPtyRequest,
  UtilityReady,
  UtilityResume,
  UtilityRun,
  UtilityToChild,
  UtilityToParent,
} from "./ipc/utility";
export type { AuxPageId, ThinkerWindowApi, WindowRole } from "./ipc/window";
export { AUX_PAGE_IDS, isAuxPageId } from "./ipc/window";
export type {
  GitChangedFile,
  GitFileDiff,
  GitStatus,
  GitStatusReason,
  ThinkerWorkspaceFsApi,
  WorkspaceFile,
  WorkspaceMediaKind,
  WorkspaceNode,
} from "./ipc/workspaceFs";
export type {
  ChatMessageRow,
  ChatSessionRecord,
  MoveSessionInput,
  ReorderInput,
  SessionRunStatus,
  ThinkerWorkspacesApi,
  ThreadMeta,
  WorkspaceCreateInput,
  WorkspaceRecord,
} from "./ipc/workspaces";
export type {
  ChatImageRef,
  ChatMessage,
  ChatTimelineErrorStep,
  ChatTimelineModelSwitchStep,
  ChatTimelineResultPathKind,
  ChatTimelineStatusStep,
  ChatTimelineStep,
  ChatTimelineSubagentStep,
  ChatTimelineTextStep,
  ChatTimelineToolStep,
  Role,
} from "./protocol/message";
export type { RunResult } from "./protocol/result";
export { isCancelErrorMessage } from "./runErrors";
export { stripAnsi } from "./stripAnsi";

import type { ThinkerAgentsApi } from "./ipc/agents";
import type { ThinkerBrowserApi } from "./ipc/browser";
import type {
  AgentCancelCommand,
  AgentCancelTaskCommand,
  AgentResumeCommand,
  AgentRunCommand,
} from "./ipc/commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "./ipc/contextUsage";
import type { AgentEvent } from "./ipc/events";
import type { HitlResponse } from "./ipc/hitl";
import type { LogRecord } from "./ipc/log";
import type { ThinkerMcpApi } from "./ipc/mcp";
import type { ThinkerRulesApi } from "./ipc/rules";
import type { ThinkerSessionApi } from "./ipc/session";
import type { ThinkerSettingsApi } from "./ipc/settings";
import type { ThinkerSkillsApi } from "./ipc/skills";
import type { ThinkerTerminalApi } from "./ipc/terminal";
import type { ThinkerToolsApi } from "./ipc/tools";
import type { ThinkerTraceApi } from "./ipc/trace";
import type { ThinkerWindowApi } from "./ipc/window";
import type { ThinkerWorkspaceFsApi } from "./ipc/workspaceFs";
import type { ThinkerWorkspacesApi, ThreadMeta } from "./ipc/workspaces";
import type { RunResult } from "./protocol/result";

/**
 * Renderer 经 preload 拿到的主桥接 API。
 * 核心为运行 / 取消 / 订阅事件；设置、会话、窗口为可选附加面。
 */
export type ThinkerApi = {
  /** 发起运行；可传完整命令或仅用户消息字符串。 */
  run(command: AgentRunCommand | string): Promise<RunResult>;
  /**
   * 取消运行。
   * 可传 runId 字符串，或 `{ runId?, sessionId? }`（至少一个）；由主进程账本解析。
   */
  cancel(command?: string | AgentCancelCommand): Promise<{ ok: boolean; error?: string } | void>;
  /** 取消单个后台 Task（不停止父 run）。 */
  cancelTask?(command: AgentCancelTaskCommand): Promise<{ ok: boolean; error?: string }>;
  /** 从 checkpoint 恢复（崩溃后续跑）。 */
  resume?(command: AgentResumeCommand): Promise<RunResult>;
  /** 估算当前会话上下文占用（与模型请求同源组装）。 */
  getContextUsage?(request?: ContextUsageRequest): Promise<ContextUsageSnapshot>;
  /** 列出侧栏会话（SQLite `ThreadMeta`）。 */
  listThreads?(): Promise<ThreadMeta[]>;
  /**
   * 订阅 AgentEvent 推送。
   * @returns 取消订阅函数。
   */
  onEvent(cb: (event: AgentEvent) => void): () => void;
  /**
   * 订阅跨进程 LogRecord（desktop / agent；app 本地日志走 `@thinker-workbench/logger`）。
   * @returns 取消订阅函数。
   */
  onLog?(cb: (record: LogRecord) => void): () => void;
  /** 将 renderer 侧 LogRecord 交给主进程写入 `app.log`（fire-and-forget）。 */
  reportLog?(record: LogRecord): void;
  /** 模型 / 通用 / 快捷键设置（可选）。 */
  settings?: ThinkerSettingsApi;
  /** UI 会话快照（可选）。 */
  session?: ThinkerSessionApi;
  /** 窗口控制（可选）。 */
  window?: ThinkerWindowApi;
  /** Logs 数据面（产品工具窗）。 */
  tools?: ThinkerToolsApi;
  /** 工作空间 / 聊天会话持久化。 */
  workspaces?: ThinkerWorkspacesApi;
  /** 工作空间文件树 / 读写 / Git（右侧栏）。 */
  workspaceFs?: ThinkerWorkspaceFsApi;
  /** 终端 PTY（右侧栏 Terminal）。 */
  terminal?: ThinkerTerminalApi;
  /** 内置浏览器（右侧栏 Browser）。 */
  browser?: ThinkerBrowserApi;
  /** Skills 目录列表（Composer `/` + Customize）。 */
  skills?: ThinkerSkillsApi;
  /** Rules Customize。 */
  rules?: ThinkerRulesApi;
  /** Subagents Customize。 */
  agents?: ThinkerAgentsApi;
  /** 会话 Trace 数据面。 */
  trace?: ThinkerTraceApi;
  /** MCP 服务端管理。 */
  mcp?: ThinkerMcpApi;
  /** 答复 HITL（审批 / 澄清等）。 */
  respondHitl?(response: HitlResponse): Promise<void>;
};
