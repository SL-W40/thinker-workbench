/**
 * 主 BrowserWindow 的创建与生命周期。
 *
 * 自定义标题栏（Windows 用系统字幕按钮）、按 session 恢复几何与 hash、快捷键重载、最大化状态 IPC、
 * 关闭时写 session / 可选隐藏到托盘，以及开发态等待 Vite 后再 loadURL。
 */
import path from "node:path";
import { IpcChannels, matchAccelerator } from "@thinker-workbench/shared";
import { app, BrowserWindow, nativeImage, screen } from "electron";
import { DEV_RENDERER_URL, getAppIconPath, getAppIndexHtml } from "../config/paths";
import {
  getSessionHash,
  getSessionWindow,
  type SessionWindow,
  saveSessionNow,
  updateSessionHash,
  updateSessionWindow,
} from "../config/sessionStore";
import { getGeneralSettings, getShortcutsSettings } from "../config/settingsStore";
import { isShortcutRecording } from "../config/shortcutRecording";
import { closeAllAuxWindows, syncAuxWindowBackgrounds } from "./auxWindows";
import { syncBrowserWindowChrome, windowChromeOptions } from "./chromeOptions";
import { fitWindowToDisplay, windowMinSize } from "./defaultBounds";
import { clearApplicationMenu } from "./menu";
import { reuseMainWindowIfAlive } from "./reuseMainWindow";
import { windowBackgroundForTheme } from "./themeBackground";
import { ensureTrayForHide, shouldHideToTray } from "./tray";
import { waitForRenderer } from "./waitForRenderer";
import { registerMainWindow, unregisterContents } from "./windowRoles";

/** 主窗是否允许导航到该 URL（应用自身 / 错误页）。 */
function isAppNavigationUrl(url: string): boolean {
  if (!url || url === "about:blank") return true;
  if (url.startsWith("data:text/html")) return true;
  if (url.startsWith("file://")) return true;
  if (url.startsWith(`${DEV_RENDERER_URL}/`) || url === DEV_RENDERER_URL) return true;
  if (url.startsWith(`${DEV_RENDERER_URL}#`)) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "devtools:") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** 主窗口类型别名。 */
export type MainWindow = BrowserWindow;

/** 当前主窗口引用（关闭后置 null）。 */
let win: BrowserWindow | null = null;

/** 获取当前主 BrowserWindow；无窗口或已销毁时可能仍返回旧引用，调用方需判 isDestroyed。 */
export function getMainWindow(): BrowserWindow | null {
  return win;
}

/** 设置 → 外观变更时，同步主窗与辅助窗底色，以及 Windows 系统按钮区。 */
export function syncWindowBackgroundFromSettings(): void {
  if (win && !win.isDestroyed()) syncBrowserWindowChrome(win);
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
 * 确保主窗口存在：已有存活实例则聚焦复用，否则新建并加载内容。
 * second-instance / whenReady / activate / 托盘可能并发调用，必须幂等以免叠窗。
 * @returns 现有或新建的 BrowserWindow
 */
export function createWindow(): BrowserWindow {
  const existing = reuseMainWindowIfAlive(win);
  if (existing) return existing as BrowserWindow;

  clearApplicationMenu();

  const initial = resolveInitialWindow();
  const work = screen.getPrimaryDisplay().workAreaSize;
  const { minWidth, minHeight } = windowMinSize(work.width, work.height);

  const appIconPath = getAppIconPath();
  const appIcon = nativeImage.createFromPath(appIconPath);
  win = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    ...(typeof initial.x === "number" && typeof initial.y === "number"
      ? { x: initial.x, y: initial.y }
      : {}),
    minWidth,
    minHeight,
    backgroundColor: windowBackgroundForTheme(getGeneralSettings().uiTheme),
    ...windowChromeOptions(),
    show: false,
    icon: appIcon.isEmpty() ? appIconPath : appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 内置浏览器用 <webview> 承载：DOM 合成，应用内浮层能压在页面之上
      webviewTag: true,
    },
  });
  // 再设一次，避免部分 Windows 构建只吃构造参数里的旧缓存路径
  if (!appIcon.isEmpty()) win.setIcon(appIcon);

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

  // 阻止 Markdown 外链把整个主窗顶掉；改由内置 Browser 打开
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigationUrl(url)) return;
    event.preventDefault();
    const { browserSessionManager } =
      require("../browser/BrowserSessionManager") as typeof import("../browser/BrowserSessionManager");
    void browserSessionManager.navigate(url, { reveal: true });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppNavigationUrl(url)) return { action: "allow" };
    const { browserSessionManager } =
      require("../browser/BrowserSessionManager") as typeof import("../browser/BrowserSessionManager");
    void browserSessionManager.navigate(url, { reveal: true });
    return { action: "deny" };
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
    const { browserSessionManager } =
      require("../browser/BrowserSessionManager") as typeof import("../browser/BrowserSessionManager");
    browserSessionManager.dispose();
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
