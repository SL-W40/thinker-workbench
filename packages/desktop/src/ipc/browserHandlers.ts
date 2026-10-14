/**
 * 内置浏览器 IPC：导航 / bounds / 可见性 / 接管 / 截图预览。
 */
import fs from "node:fs";
import path from "node:path";
import { type BrowserBounds, IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { browserSessionManager } from "../browser/BrowserSessionManager";
import { getDataDir } from "../config/paths";

/** 截图预览体积上限（与工作区媒体预览同量级）。 */
const SCREENSHOT_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

/** 仅允许 dataDir/browser-screenshots 下的绝对路径。 */
function resolveScreenshotPath(raw: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const shotsRoot = path.resolve(getDataDir(), "browser-screenshots");
  const abs = path.resolve(trimmed);
  const rel = path.relative(shotsRoot, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!abs.toLowerCase().endsWith(".png")) return null;
  return abs;
}

/** 注册 browser:* 通道。 */
export function registerBrowserHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.browserGetState, async () => {
    return browserSessionManager.getState();
  });

  ipcMain.handle(IpcChannels.browserNavigate, async (_evt, url: string) => {
    if (typeof url !== "string" || !url.trim()) {
      throw new Error("url is required");
    }
    return browserSessionManager.navigate(url, { reveal: true });
  });

  ipcMain.handle(IpcChannels.browserGoBack, async () => {
    return browserSessionManager.goBack();
  });

  ipcMain.handle(IpcChannels.browserGoForward, async () => {
    return browserSessionManager.goForward();
  });

  ipcMain.handle(IpcChannels.browserReload, async () => {
    return browserSessionManager.reload();
  });

  ipcMain.handle(IpcChannels.browserSetBounds, async (_evt, bounds: BrowserBounds) => {
    if (!bounds || typeof bounds !== "object") return;
    browserSessionManager.setBounds(bounds);
  });

  ipcMain.handle(IpcChannels.browserSetVisible, async (_evt, visible: boolean) => {
    browserSessionManager.setVisible(Boolean(visible));
  });

  ipcMain.handle(IpcChannels.browserTakeControl, async () => {
    return browserSessionManager.takeControl();
  });

  ipcMain.handle(IpcChannels.browserReadScreenshot, async (_evt, absolutePath: string) => {
    const abs = resolveScreenshotPath(typeof absolutePath === "string" ? absolutePath : "");
    if (!abs) return null;
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size <= 0 || st.size > SCREENSHOT_PREVIEW_MAX_BYTES) return null;
      const buf = fs.readFileSync(abs);
      return {
        dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
        size: st.size,
      };
    } catch {
      return null;
    }
  });
}
