/**
 * 通用应用设置：通知、托盘、语言、主题、字体风格、工作区访问、AI 删文件与恢复缓存 TTL、引导完成态、数据目录与日志策略。
 * 持久化于主进程设置文件；经 IPC 与 renderer 同步。
 *
 * `dataDir` 不走 `setGeneral` 即时生效，须经 `previewDataDirChange` / `applyDataDirChange`。
 */
import type {
  DataDirChangePreview,
  DataDirChangeRequest,
  DataDirChangeResult,
  DataDirMigrateProgress,
} from "./dataDir";
import {
  isCustomThemeId,
  normalizeCustomThemes,
  type CustomThemeRecord,
} from "./customTheme";
import {
  type AiLocale,
  type AppLocale,
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  normalizeAiLocale,
  normalizeAppLocale,
} from "./locale";

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
export function resolveVisualThemeId(
  themeId: AppThemeId,
  prefersDark: boolean,
): AppThemeId {
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

/** 字体 / 排版风格：常规无衬线 vs 手写笔记感。 */
export const APP_TYPE_STYLE_IDS = ["regular", "hand"] as const;
/** 字体风格联合类型。 */
export type AppTypeStyle = (typeof APP_TYPE_STYLE_IDS)[number];
/** 默认风格：常规无衬线。 */
export const DEFAULT_APP_TYPE_STYLE: AppTypeStyle = "regular";

/**
 * 将未知值规范为合法字体风格。
 * 不在目录内时返回 `fallback`。
 */
export function normalizeAppTypeStyle(
  value: unknown,
  fallback: AppTypeStyle = DEFAULT_APP_TYPE_STYLE,
): AppTypeStyle {
  return typeof value === "string" && (APP_TYPE_STYLE_IDS as readonly string[]).includes(value)
    ? (value as AppTypeStyle)
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
  /** 手写字体 + 草图图示，或常规无衬线 + 经典 Mermaid。 */
  uiTypeStyle: AppTypeStyle;
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
   */
  shellAllowlist: string[];
};

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
  return typeof value === "string" &&
    (SHELL_APPROVAL_MODES as readonly string[]).includes(value)
    ? (value as ShellApprovalMode)
    : fallback;
}

/**
 * 规范化白名单。
 * `raw` 为 `undefined` 时用默认列表；传入数组（含空）则去空白、去重、小写化。
 */
export function normalizeShellAllowlist(raw: unknown): string[] {
  if (raw === undefined) return [...DEFAULT_SHELL_ALLOWLIST];
  if (!Array.isArray(raw)) return [...DEFAULT_SHELL_ALLOWLIST];
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

/** 规范化 shell profile id。 */
export function normalizeShellProfileId(value: unknown, fallback = "default"): string {
  if (typeof value !== "string") return fallback;
  const id = value.trim();
  return id || fallback;
}

/**
 * 取命令行首 token（剥路径与 Windows 扩展名），供白名单匹配。
 * 与 engine `commandBaseToken` 语义一致。
 */
export function shellCommandBaseToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? "";
  const base = first.replace(/^["']|["']$/g, "");
  const name = base.split(/[/\\]/).pop() ?? base;
  return name.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

/** 设置页可选的日志保留天数（含「永不」= 0）。 */
export const LOG_RETENTION_DAY_OPTIONS = [0, 7, 14, 30, 90] as const;

/** 设置页可选的删除恢复缓存 TTL（天；含「永不」= 0）。 */
export const DELETE_FILE_RESTORE_TTL_DAY_OPTIONS = [1, 3, 7, 14, 30, 90, 0] as const;

/** 删除恢复缓存默认保留 7 天。 */
export const DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS = 7;

/** 将未知值规范为合法 TTL 天数（0～3650）。 */
export function normalizeDeleteFileRestoreTtlDays(
  value: unknown,
  fallback: number = DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(3650, Math.floor(value)));
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
  uiTypeStyle: DEFAULT_APP_TYPE_STYLE,
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
    base.deleteFileRestoreTtlDays = normalizeDeleteFileRestoreTtlDays(
      obj.deleteFileRestoreTtlDays,
    );
  }
  base.customThemes = normalizeCustomThemes(obj.customThemes);
  if (themeCatalogVersion < THEME_CATALOG_VERSION) {
    base.uiTheme = migrateAppThemeFromCatalogV1(obj.uiTheme);
  } else {
    base.uiTheme = normalizeUiTheme(obj.uiTheme, base.customThemes, DEFAULT_APP_THEME);
  }
  base.uiTypeStyle = normalizeAppTypeStyle(obj.uiTypeStyle, DEFAULT_APP_TYPE_STYLE);
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
  return base;
}
