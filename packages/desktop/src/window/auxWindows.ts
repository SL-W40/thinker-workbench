/**
 * 按页面维护的辅助 BrowserWindow（控制台：Settings / Logs / Components）。
 *
 * - 每种页面至多一个；`settings` 与 `tools` 共用同一控制台窗
 * - 再次打开时聚焦已有窗口
 * - 不写入主 session 的 hash / 栈 / 几何
 * - 关闭时直接销毁（不隐藏到托盘）
 * - 主窗口关闭时由 createWindow 调用 closeAllAuxWindows
 */
import path from "node:path";
import { BrowserWindow, app, screen } from "electron";
import { IpcChannels, matchAccelerator, type AuxPageId } from "@thinker-workbench/shared";
import { getGeneralSettings, getShortcutsSettings } from "../config/settingsStore";
import { isShortcutRecording } from "../config/shortcutRecording";
import { DEV_RENDERER_URL, getAppIconPath, getAppIndexHtml } from "../config/paths";
import { APP_NAME } from "../config/appIdentity";
import { windowMinSize } from "./defaultBounds";
import { windowBackgroundForTheme } from "./themeBackground";
import { waitForRenderer } from "./waitForRenderer";
import { registerAuxWindow, roleForWebContents, unregisterContents } from "./windowRoles";

/** 英文任务栏 / 原生标题（辅助窗精简栏另有本地化文案）。 */
const AUX_TITLE_EN = "Console";

/** `settings` / `tools` 共用同一控制台窗。 */
function resolveAuxSlot(_page: AuxPageId): "tools" {
  return "tools";
}

/** 控制台初始 hash：设置入口落到 Settings 分区。 */
function auxHashFor(page: AuxPageId): string {
  return page === "settings" ? "#/tools/settings" : "#/tools";
}

/** page → 辅助窗口。 */
const auxByPage = new Map<AuxPageId, BrowserWindow>();

/** 辅助窗口默认尺寸（相对主窗略小）。 */
const AUX_WIDTH = 960;
const AUX_HEIGHT = 720;

/** 相对主窗的偏移，避免完全叠在一起。 */
const AUX_OFFSET = 36;

/** 显示并聚焦已有窗口。 */
function showAndFocus(target: BrowserWindow): void {
  if (target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

/** 查找仍存活的主窗口（按角色表，避免与 createWindow 循环依赖）。 */
function findMainWindow(): BrowserWindow | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    if (roleForWebContents(w.webContents.id).kind === "main") return w;
  }
  return null;
}

/** 计算辅助窗口初始位置：主窗附近并夹到工作区。 */
function resolveAuxBounds(): { x?: number; y?: number; width: number; height: number } {
  const work = screen.getPrimaryDisplay().workArea;
  const { minWidth, minHeight } = windowMinSize(work.width, work.height);
  const width = Math.min(AUX_WIDTH, work.width);
  const height = Math.min(AUX_HEIGHT, work.height);

  const main = findMainWindow();
  if (main) {
    const b = main.getBounds();
    const x = Math.min(b.x + AUX_OFFSET, work.x + work.width - width);
    const y = Math.min(b.y + AUX_OFFSET, work.y + work.height - height);
    return {
      width: Math.max(minWidth, width),
      height: Math.max(minHeight, height),
      x: Math.max(work.x, x),
      y: Math.max(work.y, y),
    };
  }

  return {
    width: Math.max(minWidth, width),
    height: Math.max(minHeight, height),
  };
}

/**
 * 加载辅助页内容：固定 hash，不经 session。
 */
async function loadAuxContent(target: BrowserWindow, page: AuxPageId): Promise<void> {
  const hash = auxHashFor(page);
  if (!app.isPackaged) {
    await waitForRenderer(DEV_RENDERER_URL);
    if (target.isDestroyed()) return;
    await target.loadURL(`${DEV_RENDERER_URL}${hash}`);
    return;
  }
  // 与主窗一致：hash 选项不含 `#`
  await target.loadFile(getAppIndexHtml(), { hash: hash.replace(/^#/, "") });
}

/** 创建控制台辅助窗口。 */
function createAuxWindow(page: AuxPageId): BrowserWindow {
  const slot = resolveAuxSlot(page);
  const bounds = resolveAuxBounds();
  const work = screen.getPrimaryDisplay().workAreaSize;
  const { minWidth, minHeight } = windowMinSize(work.width, work.height);

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(typeof bounds.x === "number" && typeof bounds.y === "number"
      ? { x: bounds.x, y: bounds.y }
      : {}),
    minWidth,
    minHeight,
    title: `${APP_NAME} - ${AUX_TITLE_EN}`,
    backgroundColor: windowBackgroundForTheme(getGeneralSettings().uiTheme),
    frame: false,
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const contentsId = registerAuxWindow(win, slot);
  auxByPage.set(slot, win);

  win.once("ready-to-show", () => showAndFocus(win));

  win.webContents.on("before-input-event", (event, input) => {
    // 录制快捷键时把按键留给渲染进程，勿触发 reload
    if (isShortcutRecording(win.webContents.id)) return;
    const shortcuts = getShortcutsSettings();
    if (matchAccelerator(input, shortcuts.reload)) {
      event.preventDefault();
      if (!win.isDestroyed()) win.webContents.reload();
    }
  });

  win.on("maximize", () => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.windowMaximized, true);
  });
  win.on("unmaximize", () => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.windowMaximized, false);
  });

  // 辅助窗关闭即销毁，不进托盘
  win.on("closed", () => {
    unregisterContents(contentsId);
    if (auxByPage.get(slot) === win) auxByPage.delete(slot);
  });

  void (async () => {
    try {
      await loadAuxContent(win, page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!win.isDestroyed()) {
        await win.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            `<!doctype html><meta charset="utf-8" /><body style="font:14px/1.5 sans-serif;padding:32px;background:#f4ebe0;color:#2a2218"><h1>启动失败</h1><p>${message}</p></body>`,
          )}`,
        );
        showAndFocus(win);
      }
    }
  })();

  return win;
}

/** 已有控制台窗时切换到目标 hash（设置入口落到 Settings tab）。 */
function navigateAuxHash(target: BrowserWindow, page: AuxPageId): void {
  const hash = auxHashFor(page);
  if (target.isDestroyed()) return;
  void target.webContents.executeJavaScript(
    `window.location.hash = ${JSON.stringify(hash)}`,
  );
}

/**
 * 打开或聚焦控制台辅助窗口。
 * @returns 目标窗口
 */
export function openOrFocusAuxWindow(page: AuxPageId): BrowserWindow {
  const slot = resolveAuxSlot(page);
  const existing = auxByPage.get(slot);
  if (existing && !existing.isDestroyed()) {
    // 仅「打开设置」时强制切到 Settings tab；普通控制台聚焦保留当前 tab
    if (page === "settings") navigateAuxHash(existing, page);
    showAndFocus(existing);
    return existing;
  }
  return createAuxWindow(page);
}

/**
 * 若控制台辅助窗口已存在则聚焦。
 * @returns 是否已聚焦已有窗口
 */
export function focusAuxWindowIfOpen(page: AuxPageId): boolean {
  const slot = resolveAuxSlot(page);
  const existing = auxByPage.get(slot);
  if (!existing || existing.isDestroyed()) return false;
  if (page === "settings") navigateAuxHash(existing, page);
  showAndFocus(existing);
  return true;
}

/** 关闭并销毁全部辅助窗口。 */
export function closeAllAuxWindows(): void {
  for (const win of [...auxByPage.values()]) {
    if (!win.isDestroyed()) win.destroy();
  }
  auxByPage.clear();
}

/** 外观主题变更时同步所有辅助窗背景色。 */
export function syncAuxWindowBackgrounds(): void {
  const color = windowBackgroundForTheme(getGeneralSettings().uiTheme);
  for (const win of auxByPage.values()) {
    if (!win.isDestroyed()) win.setBackgroundColor(color);
  }
}
