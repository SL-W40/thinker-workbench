/**
 * 更新相关 IPC：状态查询 / 检查 / 下载 / 安装 + 主进程状态推送。
 * dev 构建下全部走禁用分支，行为与从前一致。
 */

import type { UpdateState } from "@thinker-workbench/shared";
import { IpcChannels } from "@thinker-workbench/shared";
import { app, BrowserWindow, type IpcMain } from "electron";
import { desktopLog } from "../log/setup";
import {
  checkForUpdate,
  downloadUpdate,
  getUpdateState,
  initUpdater,
  installUpdate,
  onUpdateState,
} from "../update/updater";
import { getCurrentPackageVersion } from "../update/version";

const log = desktopLog("updateHandlers");

/** 注册更新通道（dev 下也注册，但返回禁用状态）。 */
export function registerUpdateHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.appUpdateState, () => getUpdateState());

  ipcMain.handle(IpcChannels.appUpdateCheck, async () => checkForUpdate());

  ipcMain.handle(IpcChannels.appUpdateDownload, async () => downloadUpdate());

  ipcMain.handle(IpcChannels.appUpdateInstall, () => installUpdate());

  // 状态变化时广播给所有窗口
  onUpdateState((state: UpdateState) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(IpcChannels.appUpdateEvent, state);
    }
  });
}

/** 启动时初始化（dev 下为 disabled，不做任何 IO）。 */
export function initUpdateModule(): void {
  try {
    // 版本号取自 desktop 包（未打包时读到的是 package.json 版本，够用）
    initUpdater(() => app.getVersion() || getCurrentPackageVersion(), app.isPackaged);
  } catch (err) {
    // 初始化失败不影响应用启动
    log.warn("更新模块初始化失败", { error: String(err) });
  }
}
