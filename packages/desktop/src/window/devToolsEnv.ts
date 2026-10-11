/**
 * 开发态：按环境变量打开主窗 DevTools。
 * `THINKER_OPEN_DEVTOOLS=1` 时在页面首次加载完成后再打开（detach），避免抢首屏。
 */
import { app } from "electron";
import { getMainWindow } from "./createWindow";

/** 对当前主窗应用 DevTools 开/关（已销毁或打包态则忽略）。 */
export function applyProductDevTools(enabled: boolean): void {
  if (app.isPackaged) return;
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  const open = win.webContents.isDevToolsOpened();
  if (enabled && !open) {
    win.webContents.openDevTools({ mode: "detach" });
  } else if (!enabled && open) {
    win.webContents.closeDevTools();
  }
}

/** 启动时按环境变量应用一次；等 did-finish-load，仅开发态有效。 */
export function startDevToolsPrefsBridge(): void {
  if (app.isPackaged) return;
  if (process.env.THINKER_OPEN_DEVTOOLS !== "1") return;

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  const open = () => applyProductDevTools(true);
  if (!win.webContents.isLoading()) {
    // 已加载完（或尚未开始）时下一 tick 再开，让 loadURL 有机会排队
    setImmediate(open);
    return;
  }
  win.webContents.once("did-finish-load", open);
}
