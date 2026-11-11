/**
 * 界面缩放使用 Electron 的页面缩放（`webContents.setZoomLevel`），
 * 倍数存在通用设置 `uiFontScale`（80%–125%，步进 5%）。
 *
 * Ctrl/Cmd + +/-/0、Ctrl+滚轮、捏合不再被静默吃掉：按一档改设置并立刻画出来。
 * Chromium 自己的那一跳往往更大，而且晚于事件回调，所以落定后再按设置写一次。
 */
import {
  APP_FONT_SCALE_STEP,
  DEFAULT_APP_FONT_SCALE,
  type GeneralSettings,
  IpcChannels,
  normalizeAppFontScale,
} from "@thinker-workbench/shared";
import { BrowserWindow, type WebContents } from "electron";
import { getGeneralSettings, saveGeneralSettings } from "../config/settingsStore";
import { isShortcutRecording } from "../config/shortcutRecording";
import { syncBrowserWindowChrome } from "./chromeOptions";

/** 与当前倍数差小于此值则不再 setZoomLevel。 */
const ZOOM_EPSILON = 0.001;

/** Chromium 缩放等级：factor = 1.2 ^ level。 */
const ZOOM_LEVEL_BASE = 1.2;

/** 滚轮连续触发时，两档之间的最短间隔。 */
const STEP_GAP_MS = 80;

/** before-input-event 里判断缩放快捷键所需的字段。 */
export type ZoomKeyInput = {
  type: string;
  key: string;
  code?: string;
  alt?: boolean;
  shift?: boolean;
  control?: boolean;
  meta?: boolean;
};

let lastStepAt = 0;
/** 快捷键已经改过档，短时间内忽略随后的 zoom-changed，避免再跳一档。 */
let ignoreZoomChangedUntil = 0;
const reapplyTimers = new Map<number, NodeJS.Timeout>();

/** 当前设置对应的页面缩放倍数。 */
export function uiZoomFactor(): number {
  return normalizeAppFontScale(getGeneralSettings().uiFontScale);
}

/**
 * 从当前倍数走一档。
 * `direction` 为 1 放大、-1 缩小、0 回到 100%。结果吸附到 5% 并夹在 80%–125%。
 */
export function stepUiFontScale(current: number, direction: -1 | 0 | 1): number {
  if (direction === 0) return DEFAULT_APP_FONT_SCALE;
  return normalizeAppFontScale(current + direction * APP_FONT_SCALE_STEP);
}

/**
 * Chromium 默认的页面缩放快捷键：Ctrl（macOS 为 Cmd）+ +/-/0，含 Shift+= 和小键盘。
 */
export function isChromiumZoomAccelerator(
  input: ZoomKeyInput,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (input.type !== "keyDown" && input.type !== "keyUp" && input.type !== "rawKeyDown") {
    return false;
  }
  if (input.alt) return false;
  const primary = platform === "darwin" ? input.meta : input.control;
  const other = platform === "darwin" ? input.control : input.meta;
  if (!primary || other) return false;
  const key = input.key;
  const code = input.code ?? "";
  if (key === "-" || key === "_" || key === "=" || key === "+") return true;
  if (
    code === "Equal" ||
    code === "Minus" ||
    code === "NumpadAdd" ||
    code === "NumpadSubtract"
  ) {
    return true;
  }
  if (input.shift) return false;
  return key === "0" || code === "Digit0" || code === "Numpad0";
}

/** 缩放快捷键的方向：1 放大，-1 缩小，0 重置。不是缩放键时返回 null。 */
export function chromiumZoomDirection(
  input: ZoomKeyInput,
  platform: NodeJS.Platform = process.platform,
): -1 | 0 | 1 | null {
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") return null;
  if (!isChromiumZoomAccelerator(input, platform)) return null;
  const key = input.key;
  const code = input.code ?? "";
  if (key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract") return -1;
  if (!input.shift && (key === "0" || code === "Digit0" || code === "Numpad0")) return 0;
  return 1;
}

function zoomLevelFor(factor: number): number {
  return Math.log(factor) / Math.log(ZOOM_LEVEL_BASE);
}

/** 把某个 webContents 的页面缩放设成给定倍数（已是该值则跳过）。 */
export function applyContentsZoom(contents: WebContents, factor: number): void {
  if (contents.isDestroyed()) return;
  const next = normalizeAppFontScale(factor);
  if (Math.abs(contents.getZoomFactor() - next) < ZOOM_EPSILON) return;
  contents.setZoomLevel(zoomLevelFor(next));
}

/** Chromium 常常在回调返回后才写入自己的缩放，隔一拍再按设置盖回去。 */
function reapplySoon(contents: WebContents): void {
  if (contents.isDestroyed()) return;
  const id = contents.id;
  const run = () => {
    if (!contents.isDestroyed()) applyContentsZoom(contents, uiZoomFactor());
  };
  setImmediate(run);
  const prev = reapplyTimers.get(id);
  if (prev) clearTimeout(prev);
  reapplyTimers.set(
    id,
    setTimeout(() => {
      reapplyTimers.delete(id);
      run();
    }, 50),
  );
}

function publishZoom(general: GeneralSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    applyContentsZoom(win.webContents, general.uiFontScale);
    syncBrowserWindowChrome(win);
    win.webContents.send(IpcChannels.settingsGeneralChanged, general);
    reapplySoon(win.webContents);
  }
}

/**
 * 按方向改一档并保存。已经在边界上时不改设置，只把 Chromium 多出来的缩放盖回当前档。
 * 返回是否写入了新档位。
 */
export function commitZoomStep(direction: -1 | 0 | 1): boolean {
  const current = uiZoomFactor();
  const next = stepUiFontScale(current, direction);
  if (direction !== 0 && next === current) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        applyContentsZoom(win.webContents, current);
        reapplySoon(win.webContents);
      }
    }
    return false;
  }
  publishZoom(saveGeneralSettings({ uiFontScale: next }));
  return true;
}

function commitZoomStepThrottled(direction: -1 | 0 | 1): void {
  const now = Date.now();
  if (direction !== 0 && now - lastStepAt < STEP_GAP_MS) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) reapplySoon(win.webContents);
    }
    return;
  }
  lastStepAt = now;
  commitZoomStep(direction);
}

/** 新建窗口时挂上：首屏按设置缩放，快捷键和滚轮按 5% 改这一档。 */
export function bindWindowZoom(win: BrowserWindow): void {
  const contents = win.webContents;
  const apply = () => {
    if (win.isDestroyed()) return;
    applyContentsZoom(contents, uiZoomFactor());
  };
  apply();
  contents.on("did-finish-load", apply);
  win.on("ready-to-show", apply);
  const contentsId = contents.id;
  win.on("closed", () => {
    const timer = reapplyTimers.get(contentsId);
    if (timer) clearTimeout(timer);
    reapplyTimers.delete(contentsId);
  });

  contents.on("before-input-event", (event, input) => {
    const direction = chromiumZoomDirection(input);
    if (direction === null) return;
    if (isShortcutRecording(contents.id)) return;
    event.preventDefault();
    ignoreZoomChangedUntil = Date.now() + 200;
    commitZoomStepThrottled(direction);
  });
  contents.on("zoom-changed", (_event, zoomDirection) => {
    if (Date.now() < ignoreZoomChangedUntil) {
      reapplySoon(contents);
      return;
    }
    commitZoomStepThrottled(zoomDirection === "in" ? 1 : -1);
  });
}

/** 设置变更后，把所有窗口的页面缩放刷成当前 uiFontScale。 */
export function syncAllWindowZoom(): void {
  const factor = uiZoomFactor();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) applyContentsZoom(win.webContents, factor);
  }
}
