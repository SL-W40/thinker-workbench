/**
 * UI session IPC：同步读取快照、异步写入快照。
 *
 * `sessionGet` 使用 sendSync（`event.returnValue`），供首屏恢复 hash/页面栈。
 * 辅助窗口不读写主 session，避免污染主窗路由栈。
 */
import { IpcChannels, type UiSessionSnapshot } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { getUiSessionSnapshot, setUiSessionSnapshot } from "../config/sessionStore";
import { roleForWebContents } from "../window/windowRoles";

/** 为辅助窗构造仅含该页的临时快照（不持久化）。 */
function auxBootSnapshot(page: string): UiSessionSnapshot {
  return {
    hash: `#/${page}`,
    settingsSection: "general",
    stack: { entries: [page], index: 0, visited: [page] },
  };
}

/** 注册 session 读写通道。 */
export function registerSessionHandlers(ipcMain: IpcMain): void {
  ipcMain.on(IpcChannels.sessionGet, (event) => {
    const role = roleForWebContents(event.sender.id);
    if (role.kind === "aux") {
      event.returnValue = auxBootSnapshot(role.page);
      return;
    }
    event.returnValue = getUiSessionSnapshot();
  });
  ipcMain.on(IpcChannels.sessionSet, (event, snapshot: UiSessionSnapshot) => {
    // 辅助窗的页面栈 / hash 不得写回主 session
    if (roleForWebContents(event.sender.id).kind === "aux") return;
    if (!snapshot || typeof snapshot !== "object") return;
    setUiSessionSnapshot(snapshot);
  });
}
