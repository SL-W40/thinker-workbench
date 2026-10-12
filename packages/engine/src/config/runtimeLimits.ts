/**
 * Agent 运行时限额：由桌面 Settings 经 hello / run / resume 下发。
 */
import {
  DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
  DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
  DEFAULT_MAX_AGENT_STEPS,
  DEFAULT_MAX_SUBAGENT_STEPS,
  DEFAULT_MCP_CALL_TIMEOUT_MS,
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MODEL_RETRY_BASE_DELAY_MS,
  DEFAULT_MODEL_RETRY_MAX_ATTEMPTS,
  DEFAULT_READ_FILE_MAX_CHARS,
  DEFAULT_SHELL_BLOCK_UNTIL_MS,
  DEFAULT_SHELL_OUTPUT_CAP,
  normalizeContextFilesMaxFileBytes,
  normalizeContextFilesMaxTotalBytes,
  normalizeDefaultShellBlockUntilMs,
  normalizeMaxAgentSteps,
  normalizeMaxSubagentSteps,
  normalizeMcpCallTimeoutMs,
  normalizeMcpConnectTimeoutMs,
  normalizeModelRetryBaseDelayMs,
  normalizeModelRetryMaxAttempts,
  normalizeReadFileDefaultMaxChars,
  normalizeShellOutputCap,
} from "@thinker-workbench/shared";

/** hello / run / resume 可携带的限额字段（均可选）。 */
export type RuntimeLimitsPatch = {
  maxAgentSteps?: number;
  maxSubagentSteps?: number;
  modelRetryMaxAttempts?: number;
  modelRetryBaseDelayMs?: number;
  defaultShellBlockUntilMs?: number;
  shellOutputCap?: number;
  mcpConnectTimeoutMs?: number;
  mcpCallTimeoutMs?: number;
  contextFilesMaxFileBytes?: number;
  contextFilesMaxTotalBytes?: number;
  readFileDefaultMaxChars?: number;
};

let maxAgentSteps = DEFAULT_MAX_AGENT_STEPS;
let maxSubagentSteps = DEFAULT_MAX_SUBAGENT_STEPS;
let modelRetryMaxAttempts = DEFAULT_MODEL_RETRY_MAX_ATTEMPTS;
let modelRetryBaseDelayMs = DEFAULT_MODEL_RETRY_BASE_DELAY_MS;
let defaultShellBlockUntilMs = DEFAULT_SHELL_BLOCK_UNTIL_MS;
let shellOutputCap = DEFAULT_SHELL_OUTPUT_CAP;
let mcpConnectTimeoutMs = DEFAULT_MCP_CONNECT_TIMEOUT_MS;
let mcpCallTimeoutMs = DEFAULT_MCP_CALL_TIMEOUT_MS;
let contextFilesMaxFileBytes = DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES;
let contextFilesMaxTotalBytes = DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES;
let readFileDefaultMaxChars = DEFAULT_READ_FILE_MAX_CHARS;

/** 应用桌面下发的运行时限额（仅覆盖出现的字段）。 */
export function configureRuntimeLimits(patch?: RuntimeLimitsPatch | null): void {
  if (!patch || typeof patch !== "object") return;
  if (Object.hasOwn(patch, "maxAgentSteps")) {
    maxAgentSteps = normalizeMaxAgentSteps(patch.maxAgentSteps);
  }
  if (Object.hasOwn(patch, "maxSubagentSteps")) {
    maxSubagentSteps = normalizeMaxSubagentSteps(patch.maxSubagentSteps);
  }
  if (Object.hasOwn(patch, "modelRetryMaxAttempts")) {
    modelRetryMaxAttempts = normalizeModelRetryMaxAttempts(patch.modelRetryMaxAttempts);
  }
  if (Object.hasOwn(patch, "modelRetryBaseDelayMs")) {
    modelRetryBaseDelayMs = normalizeModelRetryBaseDelayMs(patch.modelRetryBaseDelayMs);
  }
  if (Object.hasOwn(patch, "defaultShellBlockUntilMs")) {
    defaultShellBlockUntilMs = normalizeDefaultShellBlockUntilMs(patch.defaultShellBlockUntilMs);
  }
  if (Object.hasOwn(patch, "shellOutputCap")) {
    shellOutputCap = normalizeShellOutputCap(patch.shellOutputCap);
  }
  if (Object.hasOwn(patch, "mcpConnectTimeoutMs")) {
    mcpConnectTimeoutMs = normalizeMcpConnectTimeoutMs(patch.mcpConnectTimeoutMs);
  }
  if (Object.hasOwn(patch, "mcpCallTimeoutMs")) {
    mcpCallTimeoutMs = normalizeMcpCallTimeoutMs(patch.mcpCallTimeoutMs);
  }
  if (Object.hasOwn(patch, "contextFilesMaxFileBytes")) {
    contextFilesMaxFileBytes = normalizeContextFilesMaxFileBytes(patch.contextFilesMaxFileBytes);
  }
  if (Object.hasOwn(patch, "contextFilesMaxTotalBytes")) {
    contextFilesMaxTotalBytes = normalizeContextFilesMaxTotalBytes(patch.contextFilesMaxTotalBytes);
  }
  if (Object.hasOwn(patch, "readFileDefaultMaxChars")) {
    readFileDefaultMaxChars = normalizeReadFileDefaultMaxChars(patch.readFileDefaultMaxChars);
  }
}

export function getMaxAgentSteps(): number {
  return maxAgentSteps;
}
export function getMaxSubagentSteps(): number {
  return maxSubagentSteps;
}
export function getModelRetryMaxAttempts(): number {
  return modelRetryMaxAttempts;
}
export function getModelRetryBaseDelayMs(): number {
  return modelRetryBaseDelayMs;
}
export function getDefaultShellBlockUntilMs(): number {
  return defaultShellBlockUntilMs;
}
export function getShellOutputCap(): number {
  return shellOutputCap;
}
export function getMcpConnectTimeoutMs(): number {
  return mcpConnectTimeoutMs;
}
export function getMcpCallTimeoutMs(): number {
  return mcpCallTimeoutMs;
}
export function getContextFilesMaxFileBytes(): number {
  return contextFilesMaxFileBytes;
}
export function getContextFilesMaxTotalBytes(): number {
  return contextFilesMaxTotalBytes;
}
export function getReadFileDefaultMaxChars(): number {
  return readFileDefaultMaxChars;
}
