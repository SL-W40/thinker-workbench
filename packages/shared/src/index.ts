/**
 * `@thinker-workbench/shared` 包对外导出面。
 * 聚合 id、IPC 通道 / 命令 / 事件、utility 信封、设置与协议类型，供 app / desktop / agent 共用。
 */

export {
  createId,
  createRunId,
  createSessionId,
  createThreadId,
  createTraceId,
  createWorkspaceId,
} from "./ids";
export { type IpcChannel, IpcChannels } from "./ipc/channels";
export type {
  AgentCancelCommand,
  AgentHistoryMessage,
  AgentResumeCommand,
  AgentRunCommand,
} from "./ipc/commands";
export type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentEvent,
  AgentEventBase,
  AgentHitlEvent,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolEvent,
  AgentUsageEvent,
  ModelUsage,
} from "./ipc/events";
export type { HitlAction, HitlKind, HitlRequest, HitlResponse } from "./ipc/hitl";
export type {
  ShellProfile,
  TerminalEvent,
  TerminalSession,
  TerminalSessionStatus,
  ThinkerTerminalApi,
} from "./ipc/terminal";
export type {
  BrowserBounds,
  BrowserEvent,
  BrowserState,
  ThinkerBrowserApi,
} from "./ipc/browser";
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
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateItem,
  DataDirMigrateProgress,
} from "./ipc/dataDir";
export type {
  CustomThemeExport,
  CustomThemeMermaid,
  CustomThemeRecord,
  CustomThemeSnapshot,
} from "./ipc/customTheme";
export {
  CUSTOM_THEME_FORMAT,
  CUSTOM_THEME_ID_PREFIX,
  MAX_CUSTOM_THEMES,
  createCustomThemeId,
  isCustomThemeId,
  normalizeCustomThemeSnapshot,
  normalizeCustomThemes,
  parseCustomThemeExport,
  toCustomThemeExport,
} from "./ipc/customTheme";
export type {
  AppThemeBaseId,
  AppThemeCreativeId,
  AppThemeId,
  AppTypeStyle,
  AppVisualThemeId,
  AttentionPreviewKind,
  BuiltinAppThemeId,
  GeneralSettings,
  ShellApprovalMode,
  ThinkerGeneralApi,
  WorkspaceAccess,
} from "./ipc/general";
export {
  APP_THEME_BASE_IDS,
  APP_THEME_CREATIVE_IDS,
  APP_THEME_IDS,
  APP_TYPE_STYLE_IDS,
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
  DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
  DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
  LOG_RETENTION_DAY_OPTIONS,
  SHELL_APPROVAL_MODES,
  THEME_CATALOG_VERSION,
  WORKSPACE_ACCESS_OPTIONS,
  isBuiltinAppTheme,
  migrateAppThemeFromCatalogV1,
  normalizeAppTheme,
  normalizeAppTypeStyle,
  normalizeDeleteFileRestoreTtlDays,
  normalizeGeneral,
  normalizeOptionalPath,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeShellProfileId,
  shellCommandBaseToken,
  normalizeUiTheme,
  normalizeWorkspaceAccess,
  resolveVisualThemeId,
} from "./ipc/general";
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
  PageStackSnapshot,
  ThinkerSessionApi,
  UiSessionSnapshot,
} from "./ipc/session";
export type {
  ModelSettings,
  ModelSettingsPatch,
  ModelSettingsPublic,
  ThinkerSettingsApi,
} from "./ipc/settings";
export { emptyModelSettings, toPublicModelSettings } from "./ipc/settings";
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
  SHORTCUT_CATALOG,
  SHORTCUT_GROUPS,
} from "./ipc/shortcuts";
export type {
  LogFileInfo,
  LogsQuery,
  LogsResponse,
  ThinkerToolsApi,
  TraceSummary,
} from "./ipc/tools";
export type {
  McpListResult,
  McpServerConfig,
  McpServerRuntimeState,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
  McpToolSummary,
  McpTransport,
  ThinkerMcpApi,
} from "./ipc/mcp";
export type { SkillListItem, ThinkerSkillsApi } from "./ipc/skills";
export type {
  BrowserRequestAction,
  PtyRequestAction,
  UtilityBrowserEvent,
  UtilityBrowserRequest,
  UtilityCancel,
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
  ChatMessage,
  ChatTimelineErrorStep,
  ChatTimelineStatusStep,
  ChatTimelineStep,
  ChatTimelineTextStep,
  ChatTimelineToolStep,
  Role,
} from "./protocol/message";
export type { RunResult } from "./protocol/result";

import type { AgentResumeCommand, AgentRunCommand } from "./ipc/commands";
import type { ContextUsageRequest, ContextUsageSnapshot } from "./ipc/contextUsage";
import type { AgentEvent } from "./ipc/events";
import type { HitlResponse } from "./ipc/hitl";
import type { LogRecord } from "./ipc/log";
import type { ThinkerSessionApi } from "./ipc/session";
import type { ThinkerSettingsApi } from "./ipc/settings";
import type { ThinkerBrowserApi } from "./ipc/browser";
import type { ThinkerMcpApi } from "./ipc/mcp";
import type { ThinkerSkillsApi } from "./ipc/skills";
import type { ThinkerTerminalApi } from "./ipc/terminal";
import type { ThinkerToolsApi } from "./ipc/tools";
import type { ThinkerWindowApi } from "./ipc/window";
import type { ThinkerWorkspacesApi, ThreadMeta } from "./ipc/workspaces";
import type { ThinkerWorkspaceFsApi } from "./ipc/workspaceFs";
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
   * 省略或空 `runId` 时，由 desktop 桥接取消当前活动运行。
   */
  cancel(runId?: string): Promise<void>;
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
  /** Skills 目录列表（Composer `/`）。 */
  skills?: ThinkerSkillsApi;
  /** MCP 服务端管理。 */
  mcp?: ThinkerMcpApi;
  /** 答复 HITL（审批 / 澄清等）。 */
  respondHitl?(response: HitlResponse): Promise<void>;
};
