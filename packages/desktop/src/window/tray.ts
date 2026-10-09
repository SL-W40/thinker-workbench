/**
 * 系统托盘：创建/销毁、菜单文案、显示主窗口与退出标记。
 *
 * 启用「系统托盘图标」时，关窗可隐藏到托盘而不退出进程。
 */
import { Menu, Tray, app, nativeImage } from "electron";
import { getGeneralSettings } from "../config/settingsStore";
import { getAppIconPath } from "../config/paths";
import { getMainWindow } from "./createWindow";
import { trayCopy } from "./trayCopy";

/** 当前 Tray 实例。 */
let tray: Tray | null = null;
/** 用户已请求真正退出（区别于隐藏到托盘）。 */
let quitting = false;
/** 主窗口缺失时由 main 注入的重建回调。 */
let ensureWindow: (() => void) | null = null;

/**
 * 注册「确保主窗口存在」的回调（通常为 createWindow）。
 * 托盘「显示」时若窗口已销毁会调用。
 */
export function setTrayEnsureWindow(fn: () => void): void {
  ensureWindow = fn;
}

/** 是否已进入真正退出流程。 */
export function isAppQuitting(): boolean {
  return quitting;
}

/** 标记退出、销毁托盘并 `app.quit()`。 */
export function requestQuit(): void {
  quitting = true;
  destroyTray();
  app.quit();
}

/** 显示并聚焦主窗口；必要时先 ensureWindow。 */
export function showMainWindow(): void {
  ensureWindow?.();
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * 按通用设置同步托盘：开启则确保存在并刷新菜单；关闭则销毁并拉回主窗口。
 */
export function syncTrayFromSettings(): void {
  const enabled = getGeneralSettings().systemTrayIcon;
  if (enabled) {
    ensureTray();
    refreshTrayMenu();
    return;
  }
  const hadTray = Boolean(tray);
  destroyTray();
  if (hadTray) showMainWindow();
}

/** 构建托盘右键菜单（打开 / 退出）。 */
function buildTrayMenu(): Menu {
  const copy = trayCopy();
  return Menu.buildFromTemplate([
    {
      label: copy.show,
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: copy.quit,
      click: () => requestQuit(),
    },
  ]);
}

/** 刷新 tooltip 与右键菜单（语言切换后）。 */
function refreshTrayMenu(): void {
  if (!tray) return;
  const copy = trayCopy();
  tray.setToolTip(copy.tooltip);
  tray.setContextMenu(buildTrayMenu());
}

/** 若不存在则创建 Tray 并绑定单击/双击显示窗口。 */
function ensureTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(getAppIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(trayCopy().tooltip);
  tray.setContextMenu(buildTrayMenu());
  // Windows：左键打开应用；右键保留上下文菜单
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

/** 销毁托盘实例。 */
function destroyTray(): void {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

/** 托盘开启且非真正退出时，关闭应隐藏窗口而非退出。 */
export function shouldHideToTray(): boolean {
  return !quitting && getGeneralSettings().systemTrayIcon;
}

/** 隐藏到托盘前确保 Tray 已创建（例如 sync 尚未跑过）。 */
export function ensureTrayForHide(): void {
  if (getGeneralSettings().systemTrayIcon) ensureTray();
}
