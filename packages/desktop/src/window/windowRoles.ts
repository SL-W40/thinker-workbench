/**
 * BrowserWindow ↔ 角色（主窗 / 辅助页）登记表。
 *
 * 由 createWindow / auxWindows 在创建时登记，关闭时清除；
 * session / IPC 按 webContents 判断是否写入主会话。
 *
 * `closed` 时 BrowserWindow 可能已销毁，禁止再读 `win.webContents`；
 * 登记时记下 contents id，注销只按 id 删除。
 */
import type { BrowserWindow } from "electron";
import type { AuxPageId, WindowRole } from "@thinker-workbench/shared";

/** webContents.id → 角色。 */
const roles = new Map<number, WindowRole>();

/** 登记主窗口，返回 webContents.id 供 closed 时注销。 */
export function registerMainWindow(win: BrowserWindow): number {
  const id = win.webContents.id;
  roles.set(id, { kind: "main" });
  return id;
}

/** 登记辅助窗口，返回 webContents.id 供 closed 时注销。 */
export function registerAuxWindow(win: BrowserWindow, page: AuxPageId): number {
  const id = win.webContents.id;
  roles.set(id, { kind: "aux", page });
  return id;
}

/** 按 webContents.id 移除登记（窗口销毁后仍可调用）。 */
export function unregisterContents(webContentsId: number): void {
  roles.delete(webContentsId);
}

/** 按 webContents 查角色；未知视为 main（兼容旧路径）。 */
export function roleForWebContents(webContentsId: number): WindowRole {
  return roles.get(webContentsId) ?? { kind: "main" };
}
