/** 设置页可选的日志保留天数（含「永不」= 0）。 */
export const LOG_RETENTION_DAY_OPTIONS = [0, 7, 14, 30, 90] as const;

/** 设置页可选的删除恢复缓存 TTL（天；含「永不」= 0）。 */
export const DELETE_FILE_RESTORE_TTL_DAY_OPTIONS = [1, 3, 7, 14, 30, 90, 0] as const;

/** 删除恢复缓存默认保留 7 天。 */
export const DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS = 7;

/** 并行会话默认上限。 */
export const DEFAULT_MAX_PARALLEL_RUNS = 3;

/** 设置页可选的并行上限。 */
export const MAX_PARALLEL_RUNS_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

/** 等待队列默认深度。0 表示不排队，超限直接拒绝。 */
export const DEFAULT_MAX_QUEUED_RUNS = 8;

/** 设置页可选的等待队列深度。 */
export const MAX_QUEUED_RUNS_OPTIONS = [0, 1, 2, 4, 8, 16, 32] as const;

/** 排队超时默认分钟数。0 表示不超时。 */
export const DEFAULT_QUEUE_TIMEOUT_MIN = 10;

/** 设置页可选的排队超时（分钟）。 */
export const QUEUE_TIMEOUT_MIN_OPTIONS = [0, 5, 10, 30, 60] as const;

/**
 * 主会话默认最大执行步数（LangGraph superstep）。
 * 每轮模型调用与每次工具执行各计 1 步。
 */
export const DEFAULT_MAX_AGENT_STEPS = 60;
/** 子代理默认最大执行步数（每次模型调用与每次工具执行各计 1 步）。 */
export const DEFAULT_MAX_SUBAGENT_STEPS = 60;
/** 执行步数允许范围：过低会让任务无法推进，过高会失控烧 token。 */
export const MAX_AGENT_STEPS_RANGE = { min: 5, max: 500 } as const;
/** 模型重试默认次数（含首次）。 */
export const DEFAULT_MODEL_RETRY_MAX_ATTEMPTS = 3;
/** 模型重试默认基础延迟（ms）。 */
export const DEFAULT_MODEL_RETRY_BASE_DELAY_MS = 400;
/**
 * 串行工具调用最小间隔默认（ms）：时间线尾卡最小时长 850 + 收起动画 180 + 缓冲 ≈ 1200。
 * 即「最短展示 + 动画时长」，保证上一个调用卡片完全收起后，再发起下一个调用 / 显示 planning。
 * 见 `toolCallMinGapMs` 字段注释与 renderer 的 `TAIL_MIN_DISPLAY_MS` / `TAIL_EXIT_ANIM_MS`。
 */
export const DEFAULT_TOOL_CALL_MIN_GAP_MS = 1200;
/** 串行工具最小间隔允许范围（ms）；0 表示不强制间隔。 */
export const TOOL_CALL_MIN_GAP_MS_RANGE = { min: 0, max: 10_000 } as const;
/** Shell 默认等待（ms）。 */
export const DEFAULT_SHELL_BLOCK_UNTIL_MS = 30_000;
/** Shell 输出默认截断上限（字符）。 */
export const DEFAULT_SHELL_OUTPUT_CAP = 200_000;
/** MCP 连接默认超时（ms）。 */
export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 15_000;
/** MCP 调用默认超时（ms）。 */
export const DEFAULT_MCP_CALL_TIMEOUT_MS = 60_000;
/** `@` 单文件默认上限（字节）。 */
export const DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES = 100 * 1024;
/** `@` 合计默认上限（字节）。 */
export const DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES = 256 * 1024;
/** read_file 默认 max_chars。 */
export const DEFAULT_READ_FILE_MAX_CHARS = 120_000;

/** 将未知值规范为合法 TTL 天数（0～3650）。 */
export function normalizeDeleteFileRestoreTtlDays(
  value: unknown,
  fallback: number = DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(3650, Math.floor(value)));
}

/** 将未知值规范为并行会话上限（1～10）。 */
export function normalizeMaxParallelRuns(
  value: unknown,
  fallback: number = DEFAULT_MAX_PARALLEL_RUNS,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

/** 将未知值规范为等待队列深度（仅允许设置页选项）。 */
export function normalizeMaxQueuedRuns(
  value: unknown,
  fallback: number = DEFAULT_MAX_QUEUED_RUNS,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return (MAX_QUEUED_RUNS_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

/** 将未知值规范为排队超时分钟数（仅允许设置页选项）。 */
export function normalizeQueueTimeoutMin(
  value: unknown,
  fallback: number = DEFAULT_QUEUE_TIMEOUT_MIN,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return (QUEUE_TIMEOUT_MIN_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

/** 整数落在 [min, max]；非法回退 fallback。 */
export function normalizeIntInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * 归一化「最大执行步数」（superstep）。
 * 注意：仅做范围 clamp，不按旧「轮次」语义换算——历史值保持原样，由用户自行调整。
 */
export function normalizeMaxAgentSteps(
  value: unknown,
  fallback: number = DEFAULT_MAX_AGENT_STEPS,
): number {
  return normalizeIntInRange(value, fallback, MAX_AGENT_STEPS_RANGE.min, MAX_AGENT_STEPS_RANGE.max);
}

/** 归一化子代理「最大执行步数」（superstep）；同样只 clamp、不迁移历史值。 */
export function normalizeMaxSubagentSteps(
  value: unknown,
  fallback: number = DEFAULT_MAX_SUBAGENT_STEPS,
): number {
  return normalizeIntInRange(value, fallback, MAX_AGENT_STEPS_RANGE.min, MAX_AGENT_STEPS_RANGE.max);
}

export function normalizeModelRetryMaxAttempts(
  value: unknown,
  fallback: number = DEFAULT_MODEL_RETRY_MAX_ATTEMPTS,
): number {
  return normalizeIntInRange(value, fallback, 1, 10);
}

export function normalizeModelRetryBaseDelayMs(
  value: unknown,
  fallback: number = DEFAULT_MODEL_RETRY_BASE_DELAY_MS,
): number {
  return normalizeIntInRange(value, fallback, 50, 10_000);
}

/** 归一化串行工具调用最小间隔（ms）；0 表示不强制间隔。 */
export function normalizeToolCallMinGapMs(
  value: unknown,
  fallback: number = DEFAULT_TOOL_CALL_MIN_GAP_MS,
): number {
  return normalizeIntInRange(
    value,
    fallback,
    TOOL_CALL_MIN_GAP_MS_RANGE.min,
    TOOL_CALL_MIN_GAP_MS_RANGE.max,
  );
}

export function normalizeDefaultShellBlockUntilMs(
  value: unknown,
  fallback: number = DEFAULT_SHELL_BLOCK_UNTIL_MS,
): number {
  return normalizeIntInRange(value, fallback, 0, 600_000);
}

export function normalizeShellOutputCap(
  value: unknown,
  fallback: number = DEFAULT_SHELL_OUTPUT_CAP,
): number {
  return normalizeIntInRange(value, fallback, 1_000, 2_000_000);
}

export function normalizeMcpConnectTimeoutMs(
  value: unknown,
  fallback: number = DEFAULT_MCP_CONNECT_TIMEOUT_MS,
): number {
  return normalizeIntInRange(value, fallback, 1_000, 300_000);
}

export function normalizeMcpCallTimeoutMs(
  value: unknown,
  fallback: number = DEFAULT_MCP_CALL_TIMEOUT_MS,
): number {
  return normalizeIntInRange(value, fallback, 1_000, 600_000);
}

export function normalizeContextFilesMaxFileBytes(
  value: unknown,
  fallback: number = DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
): number {
  return normalizeIntInRange(value, fallback, 1_024, 10 * 1024 * 1024);
}

export function normalizeContextFilesMaxTotalBytes(
  value: unknown,
  fallback: number = DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
): number {
  return normalizeIntInRange(value, fallback, 1_024, 50 * 1024 * 1024);
}

export function normalizeReadFileDefaultMaxChars(
  value: unknown,
  fallback: number = DEFAULT_READ_FILE_MAX_CHARS,
): number {
  return normalizeIntInRange(value, fallback, 1_000, 2_000_000);
}
