/**
 * 数据目录变更 / 历史数据迁移协议。
 * 变更不即时生效：须无进行中会话，用户确认是否迁移，并经专用 IPC 提交。
 */

/** 可迁移的一项（文件或目录）。 */
export type DataDirMigrateItem = {
  /** 稳定 id，如 `catalog` / `logs` / `settings`。 */
  id: string;
  /** 展示用短名。 */
  label: string;
  /** 源绝对路径。 */
  sourcePath: string;
  /** 相对目标 dataDir 的落点（`settings.json` 等）；空表示顶层同名。 */
  destRelative: string;
  /** 是否存在于源侧。 */
  exists: boolean;
  /** 估算字节数（目录为递归合计）。 */
  bytes: number;
};

/** 预览变更：校验路径、列出将迁移项、检查运行中会话。 */
export type DataDirChangePreview = {
  /** 当前生效的数据根（已解析）。 */
  from: string;
  /** 目标数据根（已解析；空配置则为默认路径）。 */
  to: string;
  /** 配置字符串（用户输入，空表示默认）。 */
  configuredTo: string;
  /** 路径是否相对当前有变化。 */
  changed: boolean;
  /** 仍在 running 的会话数；>0 时禁止应用。 */
  runningSessionCount: number;
  /** 将复制的项（仅 exists 的会实际拷贝）。 */
  items: DataDirMigrateItem[];
  /** 可迁移总字节。 */
  totalBytes: number;
};

/** 迁移进度事件。 */
export type DataDirMigrateProgress = {
  phase: "preparing" | "copying" | "switching" | "done" | "error";
  /** 当前正在处理的项 label 或相对路径。 */
  current?: string;
  /** 已完成文件数。 */
  done: number;
  /** 总文件数。 */
  total: number;
  /** 0–100；无文件时为 0。 */
  percent: number;
  message?: string;
};

/** 应用数据目录变更的请求。 */
export type DataDirChangeRequest = {
  /** 用户配置的 dataDir（可空=默认）。 */
  dataDir: string;
  /** 是否把历史数据拷到新目录。 */
  migrate: boolean;
};

/** 应用结果。 */
export type DataDirChangeResult = {
  ok: boolean;
  general?: import("./general").GeneralSettings;
  error?: string;
  preview?: DataDirChangePreview;
};
