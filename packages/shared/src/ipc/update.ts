/**
 * 桌面自动更新（electron-updater + GitHub Releases）的契约面。
 *
 * dev 构建下更新模块整体不初始化，所有 API 返回 `UpdateState.enabled === false`，
 * 保证 `pnpm run dev` 行为不变。
 */

/** 更新流程阶段。 */
export type UpdatePhase =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

/** 远端发布版本摘要（不含二进制，仅展示用）。 */
export type UpdateReleaseInfo = {
  version: string;
  /** release notes 纯文本摘要（可为空）。 */
  notes: string;
  publishedAt?: number;
};

/** 更新状态快照：UI 唯一数据源，由主进程推 / renderer 拉。 */
export type UpdateState = {
  phase: UpdatePhase;
  /** 当前应用版本（dev 构建为 package.json 版本）。 */
  currentVersion: string;
  /** 更新能力是否可用：未打包（dev）时为 false。 */
  enabled: boolean;
  /** 发现的新版本信息。 */
  available?: UpdateReleaseInfo;
  /** 下载进度百分比（0-100）。 */
  percent?: number;
  /** 错误阶段的可展示原因。 */
  error?: string;
};

/** 初始状态构造：dev 与打包态共用。 */
export function emptyUpdateState(currentVersion: string, enabled: boolean): UpdateState {
  return { phase: enabled ? "idle" : "disabled", currentVersion, enabled };
}

/** 下载进度钳制到 0-100，避免 updater 给出异常值污染进度条。 */
export function clampUpdatePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/** Preload 暴露的更新 API。 */
export type ThinkerUpdateApi = {
  /** 读取当前状态快照。 */
  getState(): Promise<UpdateState>;
  /** 主动检查一次。 */
  check(): Promise<UpdateState>;
  /** 下载可用更新。 */
  download(): Promise<UpdateState>;
  /** 安装并重启应用。 */
  install(): Promise<boolean>;
  /** 订阅状态变更推送。 */
  onState(cb: (state: UpdateState) => void): () => void;
};
