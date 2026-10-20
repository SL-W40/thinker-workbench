/**
 * 运行时设置载荷组装：hello / run / resume 共用的单一可信源。
 *
 * desktop 三处（`buildAgentHello` / `dispatchRun` / `dispatchResume`）统一调用本函数，
 * 取代原先散落的 `runtimeLimitsPayload` / `shellPayload` / `shellSettingsPayload`。
 * 纯函数：入参 `GeneralSettings` + 已解析的 `ShellProfile`，输出全必填快照；
 * 逐字段映射与收口前完全一致（含 `trace.enabled = observabilityEnabled !== false`）。
 */
import type { GeneralSettings } from "./general";
import type { ShellProfile } from "./terminal";
import type { RuntimeSettingsSnapshot } from "./utility";

/** 从通用设置 + 已解析 shell 组装运行时设置快照。 */
export function buildRuntimeSettings(
  general: GeneralSettings,
  shell: ShellProfile,
): RuntimeSettingsSnapshot {
  return {
    aiLocale: general.aiLocale,
    workspaceAccess: general.workspaceAccess,
    allowAiDeleteFiles: general.allowAiDeleteFiles,
    allowAiShell: general.allowAiShell,
    allowAiBrowser: general.allowAiBrowser,
    shellApprovalMode: general.shellApprovalMode,
    shellAllowlist: general.shellAllowlist,
    shellBlocklist: general.shellBlocklist,
    shell,
    httpCompatibilityMode: general.httpCompatibilityMode,
    maxAgentSteps: general.maxAgentSteps,
    maxSubagentSteps: general.maxSubagentSteps,
    modelRetryMaxAttempts: general.modelRetryMaxAttempts,
    modelRetryBaseDelayMs: general.modelRetryBaseDelayMs,
    toolCallMinGapMs: general.toolCallMinGapMs,
    defaultShellBlockUntilMs: general.defaultShellBlockUntilMs,
    shellOutputCap: general.shellOutputCap,
    mcpConnectTimeoutMs: general.mcpConnectTimeoutMs,
    mcpCallTimeoutMs: general.mcpCallTimeoutMs,
    contextFilesMaxFileBytes: general.contextFilesMaxFileBytes,
    contextFilesMaxTotalBytes: general.contextFilesMaxTotalBytes,
    readFileDefaultMaxChars: general.readFileDefaultMaxChars,
    loggingEnabled: general.loggingEnabled,
    // 与收口前一致：未显式关闭 observability 即采集 Trace
    trace: { enabled: general.observabilityEnabled !== false },
  };
}
