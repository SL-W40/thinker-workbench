/**
 * Agent 运行时限额。
 *
 * 进程级只保留 hello 时下发的默认值（供 contextUsage 等无 ALS 路径兜底）；
 * 每次 run 的限额随 UtilityRun → RunContext.limits 传递，读取一律走
 * getLimit()（当前 run 优先、进程默认兜底），避免并发 run 互踩。
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
  DEFAULT_TOOL_CALL_MIN_GAP_MS,
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
  normalizeToolCallMinGapMs,
} from "@thinker-workbench/shared";
import { getRunContext } from "../runtime/runContext";

/** 一次 run 生效的限额快照：字段齐全，且均已归一化。 */
export type RuntimeLimits = {
  /** 主会话最大执行步数（LangGraph superstep）。 */
  maxAgentSteps: number;
  /** Task / 子代理最大执行步数。 */
  maxSubagentSteps: number;
  /** 模型请求最大尝试次数（含首次）。 */
  modelRetryMaxAttempts: number;
  /** 模型重试首次基础延迟（ms）。 */
  modelRetryBaseDelayMs: number;
  /** 串行工具最小间隔（ms）；0 表示不强制。 */
  toolCallMinGapMs: number;
  /** shell 默认 block_until_ms。 */
  defaultShellBlockUntilMs: number;
  /** shell 输出截断上限（字符）。 */
  shellOutputCap: number;
  /** MCP 连接超时（ms）。 */
  mcpConnectTimeoutMs: number;
  /** MCP 调用超时（ms）。 */
  mcpCallTimeoutMs: number;
  /** `@` 单文件最大字节。 */
  contextFilesMaxFileBytes: number;
  /** `@` 合计最大字节。 */
  contextFilesMaxTotalBytes: number;
  /** read_file 默认 max_chars。 */
  readFileDefaultMaxChars: number;
};

/** hello / run / resume 可携带的限额字段（均可选）。 */
export type RuntimeLimitsPatch = Partial<RuntimeLimits>;

/** 进程级默认限额：仅 hello 入口更新；run 级限额走 RunContext.limits。 */
let processDefaults: RuntimeLimits = {
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
};

/**
 * 把可能缺字段的 patch 归一成完整限额快照；缺字段回退 baseline。
 * 注意：只做 clamp，不按旧「轮次」语义换算历史值。
 */
export function resolveRuntimeLimits(
  patch?: RuntimeLimitsPatch | null,
  baseline: RuntimeLimits = processDefaults,
): RuntimeLimits {
  if (!patch || typeof patch !== "object") return { ...baseline };
  const next = { ...baseline };
  if (Object.hasOwn(patch, "maxAgentSteps")) {
    next.maxAgentSteps = normalizeMaxAgentSteps(patch.maxAgentSteps, baseline.maxAgentSteps);
  }
  if (Object.hasOwn(patch, "maxSubagentSteps")) {
    next.maxSubagentSteps = normalizeMaxSubagentSteps(
      patch.maxSubagentSteps,
      baseline.maxSubagentSteps,
    );
  }
  if (Object.hasOwn(patch, "modelRetryMaxAttempts")) {
    next.modelRetryMaxAttempts = normalizeModelRetryMaxAttempts(
      patch.modelRetryMaxAttempts,
      baseline.modelRetryMaxAttempts,
    );
  }
  if (Object.hasOwn(patch, "modelRetryBaseDelayMs")) {
    next.modelRetryBaseDelayMs = normalizeModelRetryBaseDelayMs(
      patch.modelRetryBaseDelayMs,
      baseline.modelRetryBaseDelayMs,
    );
  }
  if (Object.hasOwn(patch, "toolCallMinGapMs")) {
    next.toolCallMinGapMs = normalizeToolCallMinGapMs(
      patch.toolCallMinGapMs,
      baseline.toolCallMinGapMs,
    );
  }
  if (Object.hasOwn(patch, "defaultShellBlockUntilMs")) {
    next.defaultShellBlockUntilMs = normalizeDefaultShellBlockUntilMs(
      patch.defaultShellBlockUntilMs,
      baseline.defaultShellBlockUntilMs,
    );
  }
  if (Object.hasOwn(patch, "shellOutputCap")) {
    next.shellOutputCap = normalizeShellOutputCap(patch.shellOutputCap, baseline.shellOutputCap);
  }
  if (Object.hasOwn(patch, "mcpConnectTimeoutMs")) {
    next.mcpConnectTimeoutMs = normalizeMcpConnectTimeoutMs(
      patch.mcpConnectTimeoutMs,
      baseline.mcpConnectTimeoutMs,
    );
  }
  if (Object.hasOwn(patch, "mcpCallTimeoutMs")) {
    next.mcpCallTimeoutMs = normalizeMcpCallTimeoutMs(
      patch.mcpCallTimeoutMs,
      baseline.mcpCallTimeoutMs,
    );
  }
  if (Object.hasOwn(patch, "contextFilesMaxFileBytes")) {
    next.contextFilesMaxFileBytes = normalizeContextFilesMaxFileBytes(
      patch.contextFilesMaxFileBytes,
      baseline.contextFilesMaxFileBytes,
    );
  }
  if (Object.hasOwn(patch, "contextFilesMaxTotalBytes")) {
    next.contextFilesMaxTotalBytes = normalizeContextFilesMaxTotalBytes(
      patch.contextFilesMaxTotalBytes,
      baseline.contextFilesMaxTotalBytes,
    );
  }
  if (Object.hasOwn(patch, "readFileDefaultMaxChars")) {
    next.readFileDefaultMaxChars = normalizeReadFileDefaultMaxChars(
      patch.readFileDefaultMaxChars,
      baseline.readFileDefaultMaxChars,
    );
  }
  return next;
}

/** 应用桌面下发的进程默认限额（仅 hello 入口调用）。 */
export function configureRuntimeLimits(patch?: RuntimeLimitsPatch | null): void {
  if (!patch || typeof patch !== "object") return;
  processDefaults = resolveRuntimeLimits(patch, processDefaults);
}

/**
 * 读取某项限额：当前 run 的 RunContext.limits 优先，否则进程默认。
 * 图节点 / 工具 / 模型 / MCP / 子代理统一走这里，不要在 run 内直接读进程默认。
 */
export function getLimit<K extends keyof RuntimeLimits>(key: K): RuntimeLimits[K] {
  const fromRun = getRunContext()?.limits?.[key];
  return fromRun ?? processDefaults[key];
}

/** 进程默认「主会话最大执行步数」（无 ALS 路径兜底）。 */
export function getMaxAgentSteps(): number {
  return processDefaults.maxAgentSteps;
}
/** 进程默认「子代理最大执行步数」（无 ALS 路径兜底）。 */
export function getMaxSubagentSteps(): number {
  return processDefaults.maxSubagentSteps;
}
export function getModelRetryMaxAttempts(): number {
  return processDefaults.modelRetryMaxAttempts;
}
export function getModelRetryBaseDelayMs(): number {
  return processDefaults.modelRetryBaseDelayMs;
}
/** 进程默认「串行工具最小间隔（ms）」（无 ALS 路径兜底）。 */
export function getToolCallMinGapMs(): number {
  return processDefaults.toolCallMinGapMs;
}
export function getDefaultShellBlockUntilMs(): number {
  return processDefaults.defaultShellBlockUntilMs;
}
export function getShellOutputCap(): number {
  return processDefaults.shellOutputCap;
}
export function getMcpConnectTimeoutMs(): number {
  return processDefaults.mcpConnectTimeoutMs;
}
export function getMcpCallTimeoutMs(): number {
  return processDefaults.mcpCallTimeoutMs;
}
export function getContextFilesMaxFileBytes(): number {
  return processDefaults.contextFilesMaxFileBytes;
}
export function getContextFilesMaxTotalBytes(): number {
  return processDefaults.contextFilesMaxTotalBytes;
}
export function getReadFileDefaultMaxChars(): number {
  return processDefaults.readFileDefaultMaxChars;
}
