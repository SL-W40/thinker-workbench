/**
 * 通用应用设置：通知、托盘、语言、主题、字体大小档位、工作区访问、AI 删文件与恢复缓存 TTL、引导完成态、数据目录与日志策略。
 * 持久化于主进程设置文件；经 IPC 与 renderer 同步。
 *
 * `dataDir` 不走 `setGeneral` 即时生效，须经 `previewDataDirChange` / `applyDataDirChange`。
 */

import { type CustomThemeRecord, isCustomThemeId, normalizeCustomThemes } from "./customTheme";
import type {
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateProgress,
  DataDirPaths,
} from "./dataDir";
import {
  type AiLocale,
  type AppLocale,
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  normalizeAiLocale,
  normalizeAppLocale,
} from "./locale";
import {
  DEFAULT_TRACE_MAX_FIELD_BYTES,
  DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
  DEFAULT_TRACE_MAX_MESSAGE_CHARS,
  DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
  DEFAULT_TRACE_MAX_SESSIONS,
  DEFAULT_TRACE_MAX_TOTAL_BYTES,
  DEFAULT_TRACE_REDACT_KEYS,
  DEFAULT_TRACE_RETENTION_DAYS,
  type TraceCaptureBinary,
} from "./trace";

/**
 * 内置 UI 主题 id（写入设置的字面量）。
 * 基础：`light` / `dark` / `system`；创意：`notes` / `eyecare` / `aurora`。
 */
export const APP_THEME_IDS = ["light", "dark", "system", "notes", "eyecare", "aurora"] as const;
/** 内置主题 id（封闭联合）。 */
export type BuiltinAppThemeId = (typeof APP_THEME_IDS)[number];
/**
 * 主题偏好 id：内置、或 `custom_*` 自定义 id。
 * 内置列表仍用 `APP_THEME_IDS` / `BuiltinAppThemeId`。
 */
export type AppThemeId = BuiltinAppThemeId | (string & {});

/** 基础主题（浅 / 深 / 跟随系统）。 */
export const APP_THEME_BASE_IDS = ["light", "dark", "system"] as const;
/** 基础主题 id。 */
export type AppThemeBaseId = (typeof APP_THEME_BASE_IDS)[number];

/** 创意主题。 */
export const APP_THEME_CREATIVE_IDS = ["notes", "eyecare", "aurora"] as const;
/** 创意主题 id。 */
export type AppThemeCreativeId = (typeof APP_THEME_CREATIVE_IDS)[number];

/** 可落到内置色板的视觉主题（不含 `system`）。 */
export type AppVisualThemeId = Exclude<BuiltinAppThemeId, "system">;

/** 主题目录版本：用于把旧 `light`/`dark`/`mono` 一次性迁移到新 id。 */
export const THEME_CATALOG_VERSION = 2;

/** 默认主题：基础浅色。 */
export const DEFAULT_APP_THEME: BuiltinAppThemeId = "light";

/**
 * 将偏好主题解析为可应用的色板 id。
 * `system` 跟随 `prefersDark` 映射到浅 / 深基础色板。
 */
/**
 * 将偏好主题解析为可应用的内置色板 id。
 * `system` 跟随 OS；自定义 id 原样返回（调用方再查 customThemes）。
 */
export function resolveVisualThemeId(themeId: AppThemeId, prefersDark: boolean): AppThemeId {
  if (themeId === "system") return prefersDark ? "dark" : "light";
  return themeId;
}

/** 是否为内置主题 id（含 `system`）。 */
export function isBuiltinAppTheme(value: unknown): value is BuiltinAppThemeId {
  return typeof value === "string" && (APP_THEME_IDS as readonly string[]).includes(value);
}

/**
 * 将未知值规范为合法内置主题 id。
 * 已移除的 `mono` 恒映射为 `light`；其余旧 id 由 catalog 版本迁移处理。
 * 自定义 id 不在此函数接受范围内——见 `normalizeUiTheme`。
 */
export function normalizeAppTheme(
  value: unknown,
  fallback: BuiltinAppThemeId = DEFAULT_APP_THEME,
): BuiltinAppThemeId {
  if (typeof value !== "string") return fallback;
  if (value === "mono") return "light";
  if (value === "dusk") return "aurora";
  return isBuiltinAppTheme(value) ? value : fallback;
}

/**
 * 规范选中的主题偏好：内置 ∪ 当前自定义目录内的 id。
 */
export function normalizeUiTheme(
  value: unknown,
  customThemes: readonly CustomThemeRecord[],
  fallback: AppThemeId = DEFAULT_APP_THEME,
): AppThemeId {
  if (typeof value !== "string") return fallback;
  if (value === "mono") return "light";
  if (value === "dusk") return "aurora";
  if (isBuiltinAppTheme(value)) return value;
  if (isCustomThemeId(value) && customThemes.some((t) => t.id === value)) return value;
  return fallback;
}

/**
 * 主题目录 v1 → v2：旧纸墨 `light`→`notes`，旧夜案 `dark`→`aurora`，旧黑白 `mono`→`light`。
 * 仅在 `themeCatalogVersion < 2` 时调用，避免与新版 `light`/`dark` 字面量冲突。
 */
export function migrateAppThemeFromCatalogV1(value: unknown): AppThemeId {
  if (value === "light") return "notes";
  if (value === "dark") return "aurora";
  if (value === "mono") return "light";
  if (value === "dusk") return "aurora";
  return normalizeAppTheme(value, DEFAULT_APP_THEME);
}

/** UI 字体大小档位（相对默认约 87.5% / 100% / 112.5%）。 */
export const APP_FONT_SCALE_IDS = ["small", "medium", "large"] as const;
/** UI 字体大小档位联合类型。 */
export type AppFontScale = (typeof APP_FONT_SCALE_IDS)[number];
/** 默认：中档。 */
export const DEFAULT_APP_FONT_SCALE: AppFontScale = "medium";

/** 将未知值规范为合法字体大小档位。 */
export function normalizeAppFontScale(
  value: unknown,
  fallback: AppFontScale = DEFAULT_APP_FONT_SCALE,
): AppFontScale {
  return typeof value === "string" && (APP_FONT_SCALE_IDS as readonly string[]).includes(value)
    ? (value as AppFontScale)
    : fallback;
}

/**
 * 文件工具对工作区外路径的访问档位。
 * - `workspace`：读写均不可越界
 * - `readOutside`：可读区外绝对路径，写仍限工作区内
 * - `full`：读写均可越界
 */
export const WORKSPACE_ACCESS_OPTIONS = ["workspace", "readOutside", "full"] as const;
/** 工作区访问档位联合类型。 */
export type WorkspaceAccess = (typeof WORKSPACE_ACCESS_OPTIONS)[number];
/** 默认：可读工作区外。 */
export const DEFAULT_WORKSPACE_ACCESS: WorkspaceAccess = "readOutside";

/** 将未知值规范为合法工作区访问档位。 */
export function normalizeWorkspaceAccess(
  value: unknown,
  fallback: WorkspaceAccess = DEFAULT_WORKSPACE_ACCESS,
): WorkspaceAccess {
  return typeof value === "string" &&
    (WORKSPACE_ACCESS_OPTIONS as readonly string[]).includes(value)
    ? (value as WorkspaceAccess)
    : fallback;
}

/** 通用设置完整形状。 */
export type GeneralSettings = {
  /** agent 完成或需要关注时是否发系统通知。 */
  systemNotifications: boolean;
  /** 是否保留托盘图标；关窗时隐藏到托盘而非退出。 */
  systemTrayIcon: boolean;
  /** agent 完成或需要关注时是否播放提示音。 */
  completionSound: boolean;
  /** Renderer UI 语言。 */
  uiLocale: AppLocale;
  /** 模型回复偏好语言（含智能跟随）。 */
  aiLocale: AiLocale;
  /**
   * 文件工具工作区外访问档位。
   * 相对路径始终相对当前工作区根；本字段只控制绝对路径能否越界。
   */
  workspaceAccess: WorkspaceAccess;
  /**
   * 是否允许 AI 调用 `delete_file` 删除工作区文件（或经访问档位允许的路径）。
   * 关闭后不向模型暴露该工具；若仍被调用则执行失败。
   */
  allowAiDeleteFiles: boolean;
  /**
   * 删除文件后「恢复」缓存保留天数；超时自动丢弃且不可恢复。
   * `0` 表示不按时间过期（仍可手动恢复后清除）。
   */
  deleteFileRestoreTtlDays: number;
  /**
   * 外观主题偏好。
   * 内置：`light` / `dark` / `system` / `notes` / `eyecare` / `aurora`；
   * 或 `customThemes` 中的 `custom_*` id。
   */
  uiTheme: AppThemeId;
  /** 用户自定义主题目录（完整色板快照）。 */
  customThemes: CustomThemeRecord[];
  /** UI 整体缩放档位（小 / 中 / 大）。 */
  uiFontScale: AppFontScale;
  /** 首次启动引导是否已完成（或已跳过）。 */
  onboardingCompleted: boolean;
  /**
   * 应用根目录（与默认 `~/.thinker` 同级：catalog / 工作空间 DB / 日志 / session / skills / mcps…）。
   * 空字符串表示默认 `~/.thinker`。
   * 变更须手动保存并确认是否迁移；`setGeneral` 会忽略本字段。
   * 引导用 `settings.json` 始终在 `~/.thinker/`，不随本字段移动。
   */
  dataDir: string;
  /**
   * 日志保留天数；超过则自动删掉更早 SQLite 分片。
   * `0` 表示永不按时间清理。
   */
  logRetentionDays: number;
  /**
   * 写入日志 meta 时是否截断长文本。
   * 关闭则尽量保留全文（仍受极端上限保护）。
   */
  logTruncateLongContent: boolean;
  /**
   * 是否产出日志（文件 / 内存 / 回调）。
   * 关闭后各进程不再写入新日志。
   */
  loggingEnabled: boolean;
  /**
   * 是否允许 AI 调用 shell / shell_await。
   * 关闭后不向模型暴露这些工具。
   */
  allowAiShell: boolean;
  /**
   * 是否允许 AI 调用内置浏览器工具（navigate / snapshot / click 等）。
   * 关闭后不向模型暴露这些工具。
   */
  allowAiBrowser: boolean;
  /**
   * 默认 shell profile id；`default` 表示平台默认（Win PowerShell / Unix $SHELL）。
   */
  shellProfileId: string;
  /** 命令行审批策略。 */
  shellApprovalMode: ShellApprovalMode;
  /**
   * 免审命令首 token 白名单。
   * 磁盘缺字段时用 `DEFAULT_SHELL_ALLOWLIST`；已存空数组 `[]` 保留为空。
   * 与 `shellBlocklist` 重叠时以黑名单为准，重叠项从本列表剔除。
   */
  shellAllowlist: string[];
  /**
   * 命令首 token 硬拒绝名单。
   * 命中后任何审批模式、白名单免审、AI 放行与 HITL 确认都不能执行，也不能加入白名单。
   * 磁盘缺字段时为空（不回填）；已存空数组 `[]` 保留为空。
   */
  shellBlocklist: string[];
  /** 本地 file:// 链接是否在内置浏览器打开（否则走系统默认应用）。 */
  openLocalLinksInBrowser: boolean;
  /** 模型 HTTP 客户端兼容模式（HTTP/2 vs HTTP/1.1）。 */
  httpCompatibilityMode: HttpCompatibilityMode;
  /**
   * 同时处于 running 的聊天会话软上限（跨工作区合计）。
   * 超限时新 run 进入 FIFO；队列也满（或深度为 0）才拒绝。同 thread 仍始终互斥。
   */
  maxParallelRuns: number;
  /**
   * 全局等待队列最大深度。0 表示不排队。
   * 调低后已在队列中的项保留，只拒绝新的入队。
   */
  maxQueuedRuns: number;
  /**
   * 单条排队的最长等待（分钟）。0 表示不超时。
   * 超时后该条失败，不影响其它 run。
   */
  queueTimeoutMin: number;
  /** 主会话 agent↔tools 最大轮次。 */
  maxAgentSteps: number;
  /** Task / 子代理独立模型轮次上限。 */
  maxSubagentSteps: number;
  /** 模型请求最大尝试次数（含首次）。 */
  modelRetryMaxAttempts: number;
  /** 模型重试首次基础延迟（ms）。 */
  modelRetryBaseDelayMs: number;
  /** shell / shell_await 默认 block_until_ms。 */
  defaultShellBlockUntilMs: number;
  /** shell 输出进模型前的字符上限。 */
  shellOutputCap: number;
  /** MCP 连接超时（ms）。 */
  mcpConnectTimeoutMs: number;
  /** MCP 工具调用超时（ms）。 */
  mcpCallTimeoutMs: number;
  /** `@` 单文件最大字节。 */
  contextFilesMaxFileBytes: number;
  /** `@` 注入合计最大字节。 */
  contextFilesMaxTotalBytes: number;
  /** read_file 默认 max_chars。 */
  readFileDefaultMaxChars: number;
  /** 是否采集会话 Trace（span + jsonl）。 */
  traceEnabled: boolean;
  traceRetentionDays: number;
  traceMaxSessions: number;
  traceMaxTotalBytes: number;
  traceTruncateEnabled: boolean;
  traceMaxFieldBytes: number;
  traceMaxPayloadBytes: number;
  traceMaxMessageChars: number;
  traceMaxHistoryMessages: number;
  traceCaptureBinary: TraceCaptureBinary;
  traceRedactKeys: string[];
};

/** 模型 HTTP 兼容模式。 */
export const HTTP_COMPATIBILITY_MODES = ["http2", "http1"] as const;
export type HttpCompatibilityMode = (typeof HTTP_COMPATIBILITY_MODES)[number];
export const DEFAULT_HTTP_COMPATIBILITY_MODE: HttpCompatibilityMode = "http2";

/** 将未知值规范为合法 HTTP 兼容模式。 */
export function normalizeHttpCompatibilityMode(
  value: unknown,
  fallback: HttpCompatibilityMode = DEFAULT_HTTP_COMPATIBILITY_MODE,
): HttpCompatibilityMode {
  return typeof value === "string" &&
    (HTTP_COMPATIBILITY_MODES as readonly string[]).includes(value)
    ? (value as HttpCompatibilityMode)
    : fallback;
}

/** 命令行审批三模式。 */
export const SHELL_APPROVAL_MODES = ["ai_review", "allowlist", "unrestricted"] as const;
/** 命令行审批模式联合类型。 */
export type ShellApprovalMode = (typeof SHELL_APPROVAL_MODES)[number];
/** 默认：AI 研判。 */
export const DEFAULT_SHELL_APPROVAL_MODE: ShellApprovalMode = "ai_review";

/** 出厂白名单（用户可删；删空后不得回填）。 */
export const DEFAULT_SHELL_ALLOWLIST = [
  "git",
  "pnpm",
  "npm",
  "yarn",
  "npx",
  "node",
  "python",
  "python3",
  "rg",
  "grep",
  "ls",
  "dir",
  "pwd",
  "echo",
  "which",
  "where",
  "type",
  "cat",
  "head",
  "tail",
] as const;

/** 将未知值规范为合法审批模式。 */
export function normalizeShellApprovalMode(
  value: unknown,
  fallback: ShellApprovalMode = DEFAULT_SHELL_APPROVAL_MODE,
): ShellApprovalMode {
  return typeof value === "string" && (SHELL_APPROVAL_MODES as readonly string[]).includes(value)
    ? (value as ShellApprovalMode)
    : fallback;
}

/** 出厂黑名单为空：硬拒绝由用户显式添加，缺字段不回填。 */
export const DEFAULT_SHELL_BLOCKLIST: readonly string[] = [];

/** 去空白、去重、小写化；非字符串跳过。 */
function normalizeShellTokenItems(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const token = item.trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * 规范化白名单。
 * `raw` 为 `undefined` 时用默认列表；传入数组（含空）则去空白、去重、小写化。
 */
export function normalizeShellAllowlist(raw: unknown): string[] {
  if (raw === undefined) return [...DEFAULT_SHELL_ALLOWLIST];
  if (!Array.isArray(raw)) return [...DEFAULT_SHELL_ALLOWLIST];
  return normalizeShellTokenItems(raw);
}

/**
 * 规范化硬拒绝名单。
 * 缺字段、非数组都得到空列表；数组项再按命令首 token 折叠（剥路径与 Windows 扩展名）。
 */
export function normalizeShellBlocklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SHELL_BLOCKLIST];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const token = shellCommandBaseToken(item);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** 首 token 是否落在硬拒绝名单上。名单须已规范化。 */
export function isShellTokenBlocked(token: string, blocklist: readonly string[]): boolean {
  const base = shellCommandBaseToken(token);
  if (!base) return false;
  return blocklist.includes(base);
}

/**
 * 黑名单优先：从白名单去掉已被硬拒绝的 token。
 * 比对时同样折叠路径与扩展名，避免 `rm.exe` 留在白名单而 `rm` 在黑名单。
 */
export function shellAllowlistWithoutBlocked(
  allowlist: readonly string[],
  blocklist: readonly string[],
): string[] {
  if (blocklist.length === 0) return [...allowlist];
  return allowlist.filter((token) => !isShellTokenBlocked(token, blocklist));
}

/** 规范化 shell profile id。 */
export function normalizeShellProfileId(value: unknown, fallback = "default"): string {
  if (typeof value !== "string") return fallback;
  const id = value.trim();
  return id || fallback;
}

/**
 * 取命令行首 token（剥路径与 Windows 可执行扩展名），供白名单 / 黑名单匹配。
 * 含 `.com`（如 `format.com`）。与 engine `commandBaseToken` 语义一致。
 */
export function shellCommandBaseToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? "";
  const base = first.replace(/^["']|["']$/g, "");
  const name = base.split(/[/\\]/).pop() ?? base;
  return name.replace(/\.(exe|cmd|bat|com|ps1)$/i, "").toLowerCase();
}

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

/** 主会话默认最大轮次。 */
export const DEFAULT_MAX_AGENT_STEPS = 16;
/** 子代理默认最大轮次。 */
export const DEFAULT_MAX_SUBAGENT_STEPS = 24;
/** 模型重试默认次数（含首次）。 */
export const DEFAULT_MODEL_RETRY_MAX_ATTEMPTS = 3;
/** 模型重试默认基础延迟（ms）。 */
export const DEFAULT_MODEL_RETRY_BASE_DELAY_MS = 400;
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

export function normalizeMaxAgentSteps(
  value: unknown,
  fallback: number = DEFAULT_MAX_AGENT_STEPS,
): number {
  return normalizeIntInRange(value, fallback, 1, 200);
}

export function normalizeMaxSubagentSteps(
  value: unknown,
  fallback: number = DEFAULT_MAX_SUBAGENT_STEPS,
): number {
  return normalizeIntInRange(value, fallback, 1, 200);
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
  defaultShellBlockUntilMs: DEFAULT_SHELL_BLOCK_UNTIL_MS,
  shellOutputCap: DEFAULT_SHELL_OUTPUT_CAP,
  mcpConnectTimeoutMs: DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  mcpCallTimeoutMs: DEFAULT_MCP_CALL_TIMEOUT_MS,
  contextFilesMaxFileBytes: DEFAULT_CONTEXT_FILES_MAX_FILE_BYTES,
  contextFilesMaxTotalBytes: DEFAULT_CONTEXT_FILES_MAX_TOTAL_BYTES,
  readFileDefaultMaxChars: DEFAULT_READ_FILE_MAX_CHARS,
  traceEnabled: true,
  traceRetentionDays: DEFAULT_TRACE_RETENTION_DAYS,
  traceMaxSessions: DEFAULT_TRACE_MAX_SESSIONS,
  traceMaxTotalBytes: DEFAULT_TRACE_MAX_TOTAL_BYTES,
  traceTruncateEnabled: true,
  traceMaxFieldBytes: DEFAULT_TRACE_MAX_FIELD_BYTES,
  traceMaxPayloadBytes: DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
  traceMaxMessageChars: DEFAULT_TRACE_MAX_MESSAGE_CHARS,
  traceMaxHistoryMessages: DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
  traceCaptureBinary: "meta",
  traceRedactKeys: [...DEFAULT_TRACE_REDACT_KEYS],
};

/** 规范化可选路径字段：仅保留 trim 后的字符串，非法类型视为空。 */
export function normalizeOptionalPath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 设置页「注意力」预览种类：系统通知 toast 或完成提示音。 */
export type AttentionPreviewKind = "notification" | "sound";

/** Preload 暴露的通用设置 API。 */
export type ThinkerGeneralApi = {
  /** 异步读取完整通用设置。 */
  getGeneral(): Promise<GeneralSettings>;
  /** 同步快照，供启动闪屏 / 首帧绘制（Electron preload）。 */
  getGeneralSync?: () => GeneralSettings;
  /** 应用部分补丁并返回合并后的完整设置。 */
  setGeneral(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  /**
   * 订阅其它窗口保存的通用设置（主题 / 语言等）。
   * 发起 `setGeneral` 的窗口不会收到自己的这次推送。
   * @returns 取消订阅函数
   */
  onGeneralChanged?(cb: (general: GeneralSettings) => void): () => void;
  /** 触发一次性预览（忽略开关与焦点门控）。 */
  previewAttention(kind: AttentionPreviewKind): Promise<void>;
  /** 打开系统目录选择框；取消时返回 `null`。 */
  pickDirectory?(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
  /**
   * 打开系统「另存为」并写入文本；取消返回 `null`，成功返回保存路径。
   */
  saveTextFile?(options: {
    content: string;
    defaultPath?: string;
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  /**
   * 解析数据根与 settings 路径。
   * 省略参数时用当前已生效配置；传入草稿串可预览「保存后」落点。
   */
  resolveDataDir?(configured?: string): Promise<DataDirPaths>;
  /** 预览数据目录变更（不落盘）。 */
  previewDataDirChange?(dataDir: string): Promise<DataDirChangePreview>;
  /** 应用数据目录变更（须无 running 会话；可选择迁移）。 */
  applyDataDirChange?(request: DataDirChangeRequest): Promise<DataDirChangeResult>;
  /** 订阅迁移进度。 */
  onDataDirMigrateProgress?(cb: (progress: DataDirMigrateProgress) => void): () => void;
};

/**
 * 从磁盘 / IPC 原始值规范为完整 GeneralSettings。
 * 未知字段忽略；缺省用默认值。
 * 旧版 settings.json 无 `onboardingCompleted` 时视为已完成，避免再次弹出引导。
 *
 * @param themeCatalogVersion 磁盘根上的主题目录版本；`< 2` 时按 v1 id 迁移。
 */
export function normalizeGeneral(
  raw: unknown,
  themeCatalogVersion: number = THEME_CATALOG_VERSION,
): GeneralSettings {
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
  if (themeCatalogVersion < THEME_CATALOG_VERSION) {
    base.uiTheme = migrateAppThemeFromCatalogV1(obj.uiTheme);
  } else {
    base.uiTheme = normalizeUiTheme(obj.uiTheme, base.customThemes, DEFAULT_APP_THEME);
  }
  base.uiFontScale = normalizeAppFontScale(obj.uiFontScale, DEFAULT_APP_FONT_SCALE);
  if (typeof obj.onboardingCompleted === "boolean") {
    base.onboardingCompleted = obj.onboardingCompleted;
  } else {
    // 旧版 settings.json 无此字段 — 视为已完成，避免再次弹出引导
    base.onboardingCompleted = true;
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
  if (typeof obj.traceEnabled === "boolean") base.traceEnabled = obj.traceEnabled;
  if (typeof obj.traceRetentionDays === "number" && Number.isFinite(obj.traceRetentionDays)) {
    base.traceRetentionDays = Math.max(0, Math.min(3650, Math.floor(obj.traceRetentionDays)));
  }
  if (typeof obj.traceMaxSessions === "number" && Number.isFinite(obj.traceMaxSessions)) {
    base.traceMaxSessions = Math.max(0, Math.floor(obj.traceMaxSessions));
  }
  if (typeof obj.traceMaxTotalBytes === "number" && Number.isFinite(obj.traceMaxTotalBytes)) {
    base.traceMaxTotalBytes = Math.max(0, Math.floor(obj.traceMaxTotalBytes));
  }
  if (typeof obj.traceTruncateEnabled === "boolean") {
    base.traceTruncateEnabled = obj.traceTruncateEnabled;
  }
  if (typeof obj.traceMaxFieldBytes === "number" && Number.isFinite(obj.traceMaxFieldBytes)) {
    base.traceMaxFieldBytes = Math.max(1024, Math.floor(obj.traceMaxFieldBytes));
  }
  if (typeof obj.traceMaxPayloadBytes === "number" && Number.isFinite(obj.traceMaxPayloadBytes)) {
    base.traceMaxPayloadBytes = Math.max(1024, Math.floor(obj.traceMaxPayloadBytes));
  }
  if (typeof obj.traceMaxMessageChars === "number" && Number.isFinite(obj.traceMaxMessageChars)) {
    base.traceMaxMessageChars = Math.max(1000, Math.floor(obj.traceMaxMessageChars));
  }
  if (
    typeof obj.traceMaxHistoryMessages === "number" &&
    Number.isFinite(obj.traceMaxHistoryMessages)
  ) {
    base.traceMaxHistoryMessages = Math.max(1, Math.floor(obj.traceMaxHistoryMessages));
  }
  if (obj.traceCaptureBinary === "meta" || obj.traceCaptureBinary === "omit") {
    base.traceCaptureBinary = obj.traceCaptureBinary;
  }
  if (Array.isArray(obj.traceRedactKeys)) {
    base.traceRedactKeys = obj.traceRedactKeys.filter((k): k is string => typeof k === "string");
  }
  return base;
}
