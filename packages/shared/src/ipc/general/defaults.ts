import { DEFAULT_AI_LOCALE, DEFAULT_APP_LOCALE } from "../locale";
import { DEFAULT_APP_FONT_SCALE } from "./fontScale";
import { DEFAULT_HTTP_COMPATIBILITY_MODE } from "./http";
import {
  DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
  DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
  DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
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
  DEFAULT_SHELL_BLOCK_UNTIL_MS,
  DEFAULT_SHELL_OUTPUT_CAP,
  DEFAULT_TOOL_CALL_MIN_GAP_MS,
} from "./limits";
import type { GeneralSettings } from "./settings";
import {
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_SHELL_BLOCKLIST,
} from "./shellPolicy";
import { DEFAULT_APP_THEME } from "./theme";
import { DEFAULT_WORKSPACE_ACCESS } from "./workspaceAccess";

/** 通用设置出厂默认值。 */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  systemNotifications: true,
  systemTrayIcon: true,
  completionSound: false,
  uiLocale: DEFAULT_APP_LOCALE,
  aiLocale: DEFAULT_AI_LOCALE,
  workspaceAccess: DEFAULT_WORKSPACE_ACCESS,
  allowAiDeleteFiles: true,
  deleteFileRestoreTtlDays: DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
  uiTheme: DEFAULT_APP_THEME,
  customThemes: [],
  uiFontScale: DEFAULT_APP_FONT_SCALE,
  onboardingCompleted: false,
  dataDir: "",
  logRetentionDays: 0,
  logTruncateLongContent: true,
  loggingEnabled: true,
  allowAiShell: true,
  allowAiBrowser: true,
  allowAiGit: true,
  shellProfileId: "default",
  shellApprovalMode: DEFAULT_SHELL_APPROVAL_MODE,
  shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
  shellBlocklist: [...DEFAULT_SHELL_BLOCKLIST],
  openLocalLinksInBrowser: false,
  httpCompatibilityMode: DEFAULT_HTTP_COMPATIBILITY_MODE,
  maxParallelRuns: DEFAULT_MAX_PARALLEL_RUNS,
  maxQueuedRuns: DEFAULT_MAX_QUEUED_RUNS,
  queueTimeoutMin: DEFAULT_QUEUE_TIMEOUT_MIN,
  maxAgentSteps: DEFAULT_MAX_AGENT_STEPS,
  maxSubagentSteps: DEFAULT_MAX_SUBAGENT_STEPS,
  modelRetryMaxAttempts: DEFAULT_MODEL_RETRY_MAX_ATTEMPTS,
  modelRetryBaseDelayMs: DEFAULT_MODEL_RETRY_BASE_DELAY_MS,
  toolCallMinGapMs: DEFAULT_TOOL_CALL_MIN_GAP_MS,
  defaultShellBlockUntilMs: DEFAULT_SHELL_BLOCK_UNTIL_MS,
  shellOutputCap: DEFAULT_SHELL_OUTPUT_CAP,
  mcpConnectTimeoutMs: DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  mcpCallTimeoutMs: DEFAULT_MCP_CALL_TIMEOUT_MS,
  contextFilesMaxFileBytes: DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
  contextFilesMaxTotalBytes: DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
  readFileDefaultMaxChars: DEFAULT_READ_FILE_MAX_CHARS,
  observabilityEnabled: true,
};

/** 规范化可选路径字段：仅保留 trim 后的字符串，非法类型视为空。 */
export function normalizeOptionalPath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 设置页「注意力」预览种类：系统通知 toast 或完成提示音。 */
export type AttentionPreviewKind = "notification" | "sound";
