/**
 * 开发态：按环境变量打开主窗 DevTools。
 * `THINKER_OPEN_DEVTOOLS=1` 时启动后自动打开（detach）。
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

/** 启动时按环境变量应用一次；仅开发态有效。 */
export function startDevToolsPrefsBridge(): void {
  if (app.isPackaged) return;
  applyProductDevTools(process.env.THINKER_OPEN_DEVTOOLS === "1");
}
