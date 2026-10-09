/**
 * 内置浏览器 IPC：导航 / bounds / 可见性 / 接管。
 */
import { IpcChannels, type BrowserBounds } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { browserSessionManager } from "../browser/BrowserSessionManager";

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

  ipcMain.handle(
    IpcChannels.browserSetBounds,
    async (_evt, bounds: BrowserBounds) => {
      if (!bounds || typeof bounds !== "object") return;
      browserSessionManager.setBounds(bounds);
    },
  );

  ipcMain.handle(IpcChannels.browserSetVisible, async (_evt, visible: boolean) => {
    browserSessionManager.setVisible(Boolean(visible));
  });

  ipcMain.handle(IpcChannels.browserTakeControl, async () => {
    return browserSessionManager.takeControl();
  });
}
