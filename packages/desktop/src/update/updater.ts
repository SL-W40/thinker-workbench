/**
 * 桌面自动更新（electron-updater + GitHub Releases）。
 *
 * 三条硬约束：
 * 1. **dev 构建彻底不初始化** —— `pnpm run dev` 行为必须完全不受影响；
 * 2. **依赖缺失也不拖垮启动** —— electron-updater 走延迟 require + try/catch，缺失即降级为「不可用」；
 * 3. **启动不在关键路径** —— 所有异常都只落到日志 + 状态置错，不抛到 IPC 之外。
 *
 * 依赖安装：`pnpm --filter @thinker-workbench/desktop add electron-updater`
 * （仓库默认不带该依赖，未安装时本模块自动降级，CI 与 dev 均可正常运行。）
 */
import { createRequire } from "node:module";
import type { UpdateReleaseInfo, UpdateState } from "@thinker-workbench/shared";
import { clampUpdatePercent, emptyUpdateState } from "@thinker-workbench/shared";
import type { BrowserWindow } from "electron";
import { desktopLog } from "../log/setup";

const log = desktopLog("updater");

/** electron-updater 的最小可用面（避免为类型强依赖而差包）。 */
type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, forceRunAfter?: boolean): void;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  setFeedURL(options: unknown): void;
};

/** 当前状态快照（renderer 通过 IPC 拉取 / 订阅）。 */
let state: UpdateState = emptyUpdateState("0.0.0", false);
/** 是否已连uator 事件（只连一次）。 */
let wired = false;
/** updater 实例（仅打包态存在）。 */
let updater: AutoUpdaterLike | null = null;

const listeners = new Set<(next: UpdateState) => void>();

/** 订阅状态变化。 */
export function onUpdateState(cb: (next: UpdateState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 推送状态到所有订阅者（主进程通过 IPC 再转发给渲染层）。 */
function setState(next: UpdateState): void {
  state = next;
  for (const cb of listeners) cb(state);
}

/** 当前状态（不可用时为 disabled）。 */
export function getUpdateState(): UpdateState {
  return state;
}

/** 更新能力是否启用（打包态且依赖可用）。 */
export function isUpdateEnabled(): boolean {
  return state.enabled;
}

/**
 * 初始化更新器。
 * 非打包态（含 dev）直接早退；依赖缺失 / 初始化失败都降级为 disabled。
 */
export function initUpdater(getVersion: () => string, isPackaged: boolean): UpdateState {
  const version = getVersion();
  if (!isPackaged) {
    // dev 构建：静态禁用，绝不加载 updater
    setState(emptyUpdateState(version, false));
    return state;
  }
  try {
    // 延迟 require：依赖没装也不影响打包流程本身（与 node-pty 的加载方式同源）
    const require = createRequire(__filename);
    const { autoUpdater } = require("electron-updater") as { autoUpdater: AutoUpdaterLike };
    updater = autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    if (!wired) {
      wireEvents(autoUpdater);
      wired = true;
    }
    setState({ phase: "idle", currentVersion: version, enabled: true });
    return state;
  } catch (err) {
    log.warn("更新器不可用，已降级", { error: String(err) });
    setState({ ...emptyUpdateState(version, false), phase: "error", error: "更新组件不可用" });
    return state;
  }
}

/** 绑一次 updater 事件（结果统一映射到 `UpdateState`）。 */
function wireEvents(autoUpdater: AutoUpdaterLike): void {
  autoUpdater.on("error", (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("更新检查出错", { error: message });
    setState({ ...state, phase: "error", error: message });
  });
  autoUpdater.on("checking-for-update", () => {
    setState({ ...state, phase: "checking", error: undefined });
  });
  autoUpdater.on("update-available", (info: unknown) => {
    setState({
      ...state,
      phase: "available",
      available: toReleaseInfo(info),
      error: undefined,
    });
  });
  autoUpdater.on("update-not-available", (info: unknown) => {
    setState({
      ...state,
      phase: "not-available",
      available: toReleaseInfo(info),
      error: undefined,
    });
  });
  autoUpdater.on("download-progress", (info: unknown) => {
    const percent = (info as { percent?: number } | undefined)?.percent ?? 0;
    setState({ ...state, phase: "downloading", percent: clampUpdatePercent(percent) });
  });
  autoUpdater.on("update-downloaded", (info: unknown) => {
    setState({
      ...state,
      phase: "downloaded",
      percent: 100,
      available: toReleaseInfo(info),
    });
  });
}

/** 把 electron-updater 的 info 压成展示用结构。 */
function toReleaseInfo(info: unknown): UpdateReleaseInfo | undefined {
  if (!info || typeof info !== "object") return undefined;
  const record = info as { version?: unknown; releaseNotes?: unknown; releaseDate?: unknown };
  const notes =
    typeof record.releaseNotes === "string"
      ? record.releaseNotes.slice(0, 500)
      : Array.isArray(record.releaseNotes)
        ? record.releaseNotes
            .map((n) => String(n))
            .join("\n")
            .slice(0, 500)
        : "";
  return {
    version: String(record.version ?? ""),
    notes,
    publishedAt:
      typeof record.releaseDate === "string" ? Date.parse(record.releaseDate) : undefined,
  };
}

/** 要求已启用（未启用统一返回当前状态，不抛异常）。 */
function requireEnabled(): UpdateState | null {
  if (!state.enabled || !updater) return state;
  return null;
}

/** 检查更新。 */
export async function checkForUpdate(): Promise<UpdateState> {
  const blocked = requireEnabled();
  if (blocked) return blocked;
  try {
    setState({ ...state, phase: "checking", error: undefined });
    await updater?.checkForUpdates();
    return state;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState({ ...state, phase: "error", error: message });
    return state;
  }
}

/** 下载已发现的更新。 */
export async function downloadUpdate(): Promise<UpdateState> {
  const blocked = requireEnabled();
  if (blocked) return blocked;
  if (state.phase === "downloaded") return state;
  try {
    setState({ ...state, phase: "downloading", percent: 0, error: undefined });
    await updater?.downloadUpdate();
    return state;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState({ ...state, phase: "error", error: message });
    return state;
  }
}

/** 安装并重启（会退出当前应用）。 */
export function installUpdate(): boolean {
  if (!state.enabled || !updater) return false;
  try {
    updater.quitAndInstall(false, true);
    return true;
  } catch (err) {
    log.warn("安装更新失败", { error: String(err) });
    setState({ ...state, phase: "error", error: String(err) });
    return false;
  }
}

/** 窗口就绪后可做一次静默检查；失败不算错误（离线 / 无 release 均正常）。 */
export function maybeCheckOnLaunch(_win: BrowserWindow | null): void {
  if (!state.enabled) return;
  void checkForUpdate().catch(() => {
    /* 启动期静默：失败不打扰用户 */
  });
}
