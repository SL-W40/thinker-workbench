import { normalizeCustomThemes } from "../customTheme";
import {
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  normalizeAiLocale,
  normalizeAppLocale,
} from "../locale";
import {
  type AttentionPreviewKind,
  DEFAULT_GENERAL_SETTINGS,
  normalizeOptionalPath,
} from "./defaults";
import { DEFAULT_APP_FONT_SCALE, normalizeAppFontScale } from "./fontScale";
import { normalizeHttpCompatibilityMode } from "./http";
import {
  normalizeContextFilesMaxFileBytes,
  normalizeContextFilesMaxTotalBytes,
  normalizeDefaultShellBlockUntilMs,
  normalizeDeleteFileRestoreTtlDays,
  normalizeMaxAgentSteps,
  normalizeMaxParallelRuns,
  normalizeMaxQueuedRuns,
  normalizeMaxSubagentSteps,
  normalizeMcpCallTimeoutMs,
  normalizeMcpConnectTimeoutMs,
  normalizeModelRetryBaseDelayMs,
  normalizeModelRetryMaxAttempts,
  normalizeQueueTimeoutMin,
  normalizeReadFileDefaultMaxChars,
  normalizeShellOutputCap,
  normalizeToolCallMinGapMs,
} from "./limits";
import type { GeneralSettings } from "./settings";
import {
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_SHELL_BLOCKLIST,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeShellBlocklist,
  normalizeShellProfileId,
  shellAllowlistWithoutBlocked,
} from "./shellPolicy";
import { DEFAULT_APP_THEME, normalizeUiTheme } from "./theme";
import { DEFAULT_WORKSPACE_ACCESS, normalizeWorkspaceAccess } from "./workspaceAccess";

/** 从磁盘 / IPC 原始值规范为完整 GeneralSettings。未知字段忽略；缺省用默认值。 */
export function normalizeGeneral(raw: unknown): GeneralSettings {
  const base = { ...DEFAULT_GENERAL_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<Record<keyof GeneralSettings, unknown>>;
  if (typeof obj.systemNotifications === "boolean")
    base.systemNotifications = obj.systemNotifications;
  if (typeof obj.systemTrayIcon === "boolean") base.systemTrayIcon = obj.systemTrayIcon;
  if (typeof obj.completionSound === "boolean") base.completionSound = obj.completionSound;
  base.uiLocale = normalizeAppLocale(obj.uiLocale, DEFAULT_APP_LOCALE);
  base.aiLocale = normalizeAiLocale(obj.aiLocale, DEFAULT_AI_LOCALE);
  base.workspaceAccess = normalizeWorkspaceAccess(obj.workspaceAccess, DEFAULT_WORKSPACE_ACCESS);
  if (typeof obj.allowAiDeleteFiles === "boolean") {
    base.allowAiDeleteFiles = obj.allowAiDeleteFiles;
  }
  if (typeof obj.deleteFileRestoreTtlDays === "number") {
    base.deleteFileRestoreTtlDays = normalizeDeleteFileRestoreTtlDays(obj.deleteFileRestoreTtlDays);
  }
  base.customThemes = normalizeCustomThemes(obj.customThemes);
  base.uiTheme = normalizeUiTheme(obj.uiTheme, base.customThemes, DEFAULT_APP_THEME);
  base.uiFontScale = normalizeAppFontScale(obj.uiFontScale, DEFAULT_APP_FONT_SCALE);
  if (typeof obj.onboardingCompleted === "boolean") {
    base.onboardingCompleted = obj.onboardingCompleted;
  }
  base.dataDir = normalizeOptionalPath(obj.dataDir);
  if (typeof obj.logRetentionDays === "number" && Number.isFinite(obj.logRetentionDays)) {
    // 上限约十年，避免异常大数
    base.logRetentionDays = Math.max(0, Math.min(3650, Math.floor(obj.logRetentionDays)));
  }
  if (typeof obj.logTruncateLongContent === "boolean") {
    base.logTruncateLongContent = obj.logTruncateLongContent;
  }
  if (typeof obj.loggingEnabled === "boolean") {
    base.loggingEnabled = obj.loggingEnabled;
  }
  if (typeof obj.allowAiShell === "boolean") {
    base.allowAiShell = obj.allowAiShell;
  }
  if (typeof obj.allowAiBrowser === "boolean") {
    base.allowAiBrowser = obj.allowAiBrowser;
  }
  if (typeof obj.allowAiGit === "boolean") {
    base.allowAiGit = obj.allowAiGit;
  }
  base.shellProfileId = normalizeShellProfileId(obj.shellProfileId, "default");
  base.shellApprovalMode = normalizeShellApprovalMode(
    obj.shellApprovalMode,
    DEFAULT_SHELL_APPROVAL_MODE,
  );
  // 缺字段填默认；显式 [] 保留为空（Object.hasOwn 区分）
  if (Object.hasOwn(obj, "shellAllowlist")) {
    base.shellAllowlist = normalizeShellAllowlist(obj.shellAllowlist);
  } else {
    base.shellAllowlist = [...DEFAULT_SHELL_ALLOWLIST];
  }
  // 缺字段与非法类型都是空黑名单；显式 [] 保留为空
  if (Object.hasOwn(obj, "shellBlocklist")) {
    base.shellBlocklist = normalizeShellBlocklist(obj.shellBlocklist);
  } else {
    base.shellBlocklist = [...DEFAULT_SHELL_BLOCKLIST];
  }
  base.shellAllowlist = shellAllowlistWithoutBlocked(base.shellAllowlist, base.shellBlocklist);
  if (typeof obj.openLocalLinksInBrowser === "boolean") {
    base.openLocalLinksInBrowser = obj.openLocalLinksInBrowser;
  }
  base.httpCompatibilityMode = normalizeHttpCompatibilityMode(obj.httpCompatibilityMode);
  if (Object.hasOwn(obj, "maxParallelRuns")) {
    base.maxParallelRuns = normalizeMaxParallelRuns(obj.maxParallelRuns);
  }
  if (Object.hasOwn(obj, "maxQueuedRuns")) {
    base.maxQueuedRuns = normalizeMaxQueuedRuns(obj.maxQueuedRuns);
  }
  if (Object.hasOwn(obj, "queueTimeoutMin")) {
    base.queueTimeoutMin = normalizeQueueTimeoutMin(obj.queueTimeoutMin);
  }
  if (Object.hasOwn(obj, "maxAgentSteps")) {
    base.maxAgentSteps = normalizeMaxAgentSteps(obj.maxAgentSteps);
  }
  if (Object.hasOwn(obj, "maxSubagentSteps")) {
    base.maxSubagentSteps = normalizeMaxSubagentSteps(obj.maxSubagentSteps);
  }
  if (Object.hasOwn(obj, "modelRetryMaxAttempts")) {
    base.modelRetryMaxAttempts = normalizeModelRetryMaxAttempts(obj.modelRetryMaxAttempts);
  }
  if (Object.hasOwn(obj, "modelRetryBaseDelayMs")) {
    base.modelRetryBaseDelayMs = normalizeModelRetryBaseDelayMs(obj.modelRetryBaseDelayMs);
  }
  if (Object.hasOwn(obj, "toolCallMinGapMs")) {
    base.toolCallMinGapMs = normalizeToolCallMinGapMs(obj.toolCallMinGapMs);
  }
  if (Object.hasOwn(obj, "defaultShellBlockUntilMs")) {
    base.defaultShellBlockUntilMs = normalizeDefaultShellBlockUntilMs(obj.defaultShellBlockUntilMs);
  }
  if (Object.hasOwn(obj, "shellOutputCap")) {
    base.shellOutputCap = normalizeShellOutputCap(obj.shellOutputCap);
  }
  if (Object.hasOwn(obj, "mcpConnectTimeoutMs")) {
    base.mcpConnectTimeoutMs = normalizeMcpConnectTimeoutMs(obj.mcpConnectTimeoutMs);
  }
  if (Object.hasOwn(obj, "mcpCallTimeoutMs")) {
    base.mcpCallTimeoutMs = normalizeMcpCallTimeoutMs(obj.mcpCallTimeoutMs);
  }
  if (Object.hasOwn(obj, "contextFilesMaxFileBytes")) {
    base.contextFilesMaxFileBytes = normalizeContextFilesMaxFileBytes(obj.contextFilesMaxFileBytes);
  }
  if (Object.hasOwn(obj, "contextFilesMaxTotalBytes")) {
    base.contextFilesMaxTotalBytes = normalizeContextFilesMaxTotalBytes(
      obj.contextFilesMaxTotalBytes,
    );
  }
  if (Object.hasOwn(obj, "readFileDefaultMaxChars")) {
    base.readFileDefaultMaxChars = normalizeReadFileDefaultMaxChars(obj.readFileDefaultMaxChars);
  }
  if (typeof obj.observabilityEnabled === "boolean") {
    base.observabilityEnabled = obj.observabilityEnabled;
  }
  return base;
}
