/**
 * Windows Toast 所需的 Start Menu 快捷方式。
 *
 * Electron 仅在存在匹配 AppUserModelID 的 Start Menu 快捷方式时才显示 Toast；
 * 未打包的 `electron .` 默认没有，故在此创建/更新一份以便预览与 Agent 告警可用。
 */
import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import { APP_NAME, APP_USER_MODEL_ID } from "../config/appIdentity";
import { getToastShortcutIconPath } from "../config/paths";

/**
 * Windows 专用：确保 Start Menu 中有带正确 AppUserModelID 的快捷方式。
 * 非 win32 直接返回；失败时仅打日志不抛错。
 */
export function ensureWindowsToastShortcut(): void {
  if (process.platform !== "win32") return;

  app.setAppUserModelId(APP_USER_MODEL_ID);

  const programs = path.join(
    app.getPath("appData"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
  );
  fs.mkdirSync(programs, { recursive: true });
  const shortcutPath = path.join(programs, `${APP_NAME}.lnk`);

  // 保留除 execPath 外的 argv，便于开发态仍指向当前项目
  const args = process.argv
    .slice(1)
    .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
    .join(" ");

  const details = {
    target: process.execPath,
    args,
    cwd: process.cwd(),
    appUserModelId: APP_USER_MODEL_ID,
    icon: getToastShortcutIconPath(),
    iconIndex: 0,
    description: APP_NAME,
  };

  const operation = fs.existsSync(shortcutPath) ? ("replace" as const) : ("create" as const);
  const ok = shell.writeShortcutLink(shortcutPath, operation, details);
  if (!ok) {
    console.error("[notify] failed to write Start Menu shortcut for toasts:", shortcutPath);
  }
}
