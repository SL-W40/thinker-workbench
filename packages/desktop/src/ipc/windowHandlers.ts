/**
 * 窗口控制 IPC：最小化、最大化切换、关闭、查询最大化、打开工具窗、
 * 辅助窗口开/聚焦、聚焦主窗、同步读取窗口角色。
 *
 * 通过事件 sender 定位对应 BrowserWindow，避免误操作其它窗口。
 */

import { IpcChannels, isAuxPageId, type WindowRole } from "@thinker-workbench/shared";
import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { focusAuxWindowIfOpen, openOrFocusAuxWindow } from "../window/auxWindows";
import { showMainWindow } from "../window/tray";
import { roleForWebContents } from "../window/windowRoles";

/** 从 invoke 事件解析所属 BrowserWindow。 */
function windowFromEvent(evt: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(evt.sender);
}

/** 注册窗口相关 invoke / sync handler。 */
export function registerWindowHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle(IpcChannels.windowMinimize, (evt) => {
    windowFromEvent(evt)?.minimize();
  });

  ipcMain.handle(IpcChannels.windowMaximize, (evt) => {
    const w = windowFromEvent(evt);
    if (!w) return false;
    // 已最大化则还原，否则最大化；返回最终是否最大化
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return w.isMaximized();
  });

  ipcMain.handle(IpcChannels.windowClose, (evt) => {
    windowFromEvent(evt)?.close();
  });

  ipcMain.handle(IpcChannels.windowIsMaximized, (evt) => {
    return Boolean(windowFromEvent(evt)?.isMaximized());
  });

  // 标题栏控制台入口：打开产品控制台（Settings / Logs / Components）
  ipcMain.handle(IpcChannels.windowToggleDevTools, () => {
    openOrFocusAuxWindow("tools");
  });

  ipcMain.handle(IpcChannels.windowOpenOrFocusPage, (_evt, page: unknown) => {
    if (!isAuxPageId(page)) return;
    openOrFocusAuxWindow(page);
  });

  ipcMain.handle(IpcChannels.windowFocusPageIfOpen, (_evt, page: unknown) => {
    if (!isAuxPageId(page)) return false;
    return focusAuxWindowIfOpen(page);
  });

  ipcMain.handle(IpcChannels.windowFocusMain, () => {
    showMainWindow();
  });

  // 同步：首帧决定精简标题栏 / 固定页面
  ipcMain.on(IpcChannels.windowGetRoleSync, (event) => {
    const role: WindowRole = roleForWebContents(event.sender.id);
    event.returnValue = role;
  });
}
