/**
 * Windows Toast 所需的 Start Menu 快捷方式。
 *
 * Electron 仅在存在匹配 AppUserModelID 的 Start Menu 快捷方式时才显示 Toast；
 * 未打包的 `electron .` 默认没有，故在此创建/更新一份以便预览与 Agent 告警可用。
 *
 * 任务栏图标也读这份快捷方式；图标文件原地覆盖时 Windows 常不刷新，
 * 因此按内容哈希复制到 userData 再写入 .lnk，并删旧链重建。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import { APP_NAME, APP_USER_MODEL_ID } from "../config/appIdentity";
import { getToastShortcutIconPath } from "../config/paths";

/**
 * 把当前 icon 拷到 userData（文件名含内容哈希），迫使 Explorer 认成新图标。
 */
function materializeShortcutIcon(): string {
  const source = getToastShortcutIconPath();
  if (!fs.existsSync(source)) return source;
  const buf = fs.readFileSync(source);
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
  const ext = path.extname(source) || ".ico";
  const dir = path.join(app.getPath("userData"), "branding");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `app-icon-${hash}${ext}`);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, buf);
  }
  // 清掉同目录其它旧哈希副本，避免堆积
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("app-icon-") && name !== path.basename(dest)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
  return dest;
}

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

  const icon = materializeShortcutIcon();
  const details = {
    target: process.execPath,
    args,
    cwd: process.cwd(),
    appUserModelId: APP_USER_MODEL_ID,
    icon,
    iconIndex: 0,
    description: APP_NAME,
  };

  // 先删再 create：replace 常不能刷新已缓存的图标
  try {
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);
  } catch {
    /* ignore */
  }
  const ok = shell.writeShortcutLink(shortcutPath, "create", details);
  if (!ok) {
    console.error("[notify] failed to write Start Menu shortcut for toasts:", shortcutPath);
  }
}
