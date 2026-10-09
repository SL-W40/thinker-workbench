/**
 * 主 BrowserWindow 的创建与生命周期。
 *
 * 无边框窗口、按 session 恢复几何与 hash、快捷键重载、最大化状态 IPC、
 * 关闭时写 session / 可选隐藏到托盘，以及开发态等待 Vite 后再 loadURL。
 */
import path from "node:path";
import { BrowserWindow, app, screen } from "electron";
import { IpcChannels, matchAccelerator } from "@thinker-workbench/shared";
import { getGeneralSettings, getShortcutsSettings } from "../config/settingsStore";
import { isShortcutRecording } from "../config/shortcutRecording";
import {
  getSessionHash,
  getSessionWindow,
  saveSessionNow,
  type SessionWindow,
  updateSessionHash,
  updateSessionWindow,
} from "../config/sessionStore";
import { DEV_RENDERER_URL, getAppIconPath, getAppIndexHtml } from "../config/paths";
import { clearApplicationMenu } from "./menu";
import { ensureTrayForHide, shouldHideToTray } from "./tray";
import { fitWindowToDisplay, windowMinSize } from "./defaultBounds";
import { windowBackgroundForTheme } from "./themeBackground";
import { waitForRenderer } from "./waitForRenderer";
import { closeAllAuxWindows, syncAuxWindowBackgrounds } from "./auxWindows";
import { registerMainWindow, unregisterContents } from "./windowRoles";

/** 主窗口类型别名。 */
export type MainWindow = BrowserWindow;

/** 当前主窗口引用（关闭后置 null）。 */
let win: BrowserWindow | null = null;

/** 获取当前主 BrowserWindow；无窗口或已销毁时可能仍返回旧引用，调用方需判 isDestroyed。 */
export function getMainWindow(): BrowserWindow | null {
  return win;
}

/** 设置 → 外观变更时，同步主窗与辅助窗原生填充色。 */
export function syncWindowBackgroundFromSettings(): void {
  const color = windowBackgroundForTheme(getGeneralSettings().uiTheme);
  if (win && !win.isDestroyed()) win.setBackgroundColor(color);
  syncAuxWindowBackgrounds();
}

/** 若窗口存在且不可见则 show。 */
function showWindow() {
  if (!win || win.isDestroyed() || win.isVisible()) return;
  win.show();
}

/** 从完整 URL 解析 hash 片段（含 `#`）；失败返回 null。 */
function hashFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hash || null;
  } catch {
    const idx = url.indexOf("#");
    return idx >= 0 ? url.slice(idx) : null;
  }
}

/** 将当前窗口几何写入 session（最大化时用 getNormalBounds）。 */
function persistWindowBounds(target: BrowserWindow): void {
  if (target.isDestroyed()) return;
  const maximized = target.isMaximized();
  const bounds = maximized ? target.getNormalBounds() : target.getBounds();
  updateSessionWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized,
  });
}

/**
 * 加载应用内容：开发态等 Vite 就绪后 loadURL；打包态 loadFile + hash。
 */
async function loadAppContent(target: BrowserWindow): Promise<void> {
  const hash = getSessionHash();
  const hashOpt = hash.replace(/^#/, "");

  if (!app.isPackaged) {
    await waitForRenderer(DEV_RENDERER_URL);
    if (target.isDestroyed()) return;
    await target.loadURL(`${DEV_RENDERER_URL}${hash}`);
    return;
  }
  await target.loadFile(getAppIndexHtml(), { hash: hashOpt });
}

/** 读取 session 窗口几何并夹到当前显示器可见区域。 */
function resolveInitialWindow(): SessionWindow {
  return fitWindowToDisplay(getSessionWindow());
}

/**
 * 创建（或重建）主窗口并开始加载内容。
 * @returns 新建的 BrowserWindow
 */
export function createWindow(): BrowserWindow {
  clearApplicationMenu();

  const initial = resolveInitialWindow();
  const work = screen.getPrimaryDisplay().workAreaSize;
  const { minWidth, minHeight } = windowMinSize(work.width, work.height);

  win = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    ...(typeof initial.x === "number" && typeof initial.y === "number"
      ? { x: initial.x, y: initial.y }
      : {}),
    minWidth,
    minHeight,
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

  const contentsId = registerMainWindow(win);

  if (initial.maximized) {
    win.maximize();
  }

  // 内容就绪后再显示，避免白闪；DevTools 见 devToolsEnv
  win.once("ready-to-show", () => {
    showWindow();
  });

  win.webContents.on("before-input-event", (event, input) => {
    // 录制快捷键时把按键留给渲染进程，勿触发 reload
    if (isShortcutRecording(contentsId)) return;
    const shortcuts = getShortcutsSettings();
    if (matchAccelerator(input, shortcuts.reload)) {
      event.preventDefault();
      win?.webContents.reload();
    }
  });

  win.on("maximize", () => {
    win?.webContents.send(IpcChannels.windowMaximized, true);
    if (win) persistWindowBounds(win);
  });
  win.on("unmaximize", () => {
    win?.webContents.send(IpcChannels.windowMaximized, false);
    if (win) persistWindowBounds(win);
  });
  win.on("resize", () => {
    if (win && !win.isMaximized()) persistWindowBounds(win);
  });
  win.on("move", () => {
    if (win && !win.isMaximized()) persistWindowBounds(win);
  });

  // SPA 内 hash 变化时写回 session
  win.webContents.on("did-navigate-in-page", (_event, url) => {
    const hash = hashFromUrl(url);
    if (hash) updateSessionHash(hash);
  });

  win.on("close", (event) => {
    // 主窗关闭（含托盘隐藏）时一并关掉辅助窗
    closeAllAuxWindows();
    if (win && !win.isDestroyed()) {
      persistWindowBounds(win);
      const hash = hashFromUrl(win.webContents.getURL());
      if (hash) updateSessionHash(hash);
      saveSessionNow();
    }
    // 启用托盘且非真正退出时：隐藏而非销毁
    if (shouldHideToTray() && win && !win.isDestroyed()) {
      event.preventDefault();
      ensureTrayForHide();
      win.hide();
    }
  });

  win.on("closed", () => {
    unregisterContents(contentsId);
    win = null;
  });

  void (async () => {
    const target = win;
    if (!target) return;

    try {
      await loadAppContent(target);
    } catch (err) {
      // 加载失败时展示简易错误页，避免空白窗口
      const message = err instanceof Error ? err.message : String(err);
      if (!target.isDestroyed()) {
        await target.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            `<!doctype html><meta charset="utf-8" /><body style="font:14px/1.5 sans-serif;padding:32px;background:#f4ebe0;color:#2a2218"><h1>启动失败</h1><p>${message}</p></body>`,
          )}`,
        );
        showWindow();
      }
    }
  })();

  return win;
}
