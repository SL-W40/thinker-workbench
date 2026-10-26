/**
 * 应用菜单控制。
 *
 * 自定义无边框标题栏场景下去掉默认的 File/Edit/View/Window/Help 菜单。
 * Windows / Linux：`Menu.setApplicationMenu(null)` 即可彻底去掉。
 * macOS：系统固定保留 Apple 菜单 + 首个 App 菜单，传 null 会回落到默认菜单
 * （默认整排 File/Edit/… 又回来了），故退化为只挂一个最简 App 菜单；
 * 剪贴板等 Edit 菜单自带的快捷键由 `applyMacEditCommand` 兜底。
 */
import type { Event, Input, WebContents } from "electron";
import { Menu } from "electron";
import { APP_NAME } from "../config/appIdentity";

/** 移除应用级菜单栏；macOS 保留最简 App 菜单（系统限制无法全空）。 */
export function clearApplicationMenu(): void {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: APP_NAME,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "close" },
          { role: "quit" },
        ],
      },
    ]),
  );
}

/** macOS 键位（Cmd + 单键）对应的编辑命令。 */
const MAC_EDIT_COMMANDS: Record<string, "copy" | "cut" | "paste" | "selectAll"> = {
  c: "copy",
  x: "cut",
  v: "paste",
  a: "selectAll",
};

/**
 * macOS 菜单里没有 Edit 角色后，Cmd+C/X/V/A 不再由菜单加速器触发，
 * 在 `before-input-event` 里拦截并转成 webContents 编辑命令。
 * 返回 true 表示已处理（调用方 event.preventDefault 后直接 return）。
 */
export function applyMacEditCommand(event: Event, input: Input, contents: WebContents): boolean {
  if (process.platform !== "darwin") return false;
  if (input.type !== "keyDown") return false;
  if (!input.meta || input.alt || input.control || input.shift) return false;
  const command = MAC_EDIT_COMMANDS[input.key.toLowerCase()];
  if (!command) return false;
  event.preventDefault();
  if (contents.isDestroyed()) return true;
  contents[command]();
  return true;
}
