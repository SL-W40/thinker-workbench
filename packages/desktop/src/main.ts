/**
 * Electron 主进程入口。
 *
 * 负责：应用标识与图标、加载 settings/session、注入 CSP、启动 agent utilityProcess、
 * 注册 IPC、创建主窗口与托盘，以及 macOS activate / 全窗口关闭时的退出策略。
 */
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme } from "electron";
import { APP_NAME, APP_USER_MODEL_ID } from "./config/appIdentity";
import { getAppIconPath } from "./config/paths";
import { loadSession } from "./config/sessionStore";
import { getGeneralSettings, loadSettings } from "./config/settingsStore";
import { reloadSessionAfterDataDirChange } from "./config/dataDirMigrate";
import { closeThinkerDb, openCatalogDb } from "./db/thinkerDb";
import { ensureDefaultWorkspace, healRunningSessions } from "./db/workspacesStore";
import { registerIpc } from "./ipc/register";
import { broadcastThreadsChanged } from "./ipc/workspacesHandlers";
import { closeLogsDb } from "./log/logsDb";
import { pruneExpiredLogs } from "./log/retention";
import { configureDesktopLog } from "./log/setup";
import { ensureWindowsToastShortcut } from "./notify/windowsToastShortcut";
import { applyContentSecurityPolicy } from "./security/csp";
import { pushAgentHello, startAgentProcess } from "./utility/startAgentProcess";
import {
  createWindow,
  getMainWindow,
  syncWindowBackgroundFromSettings,
} from "./window/createWindow";
import { startDevToolsPrefsBridge } from "./window/devToolsEnv";
import { isAppQuitting, setTrayEnsureWindow, syncTrayFromSettings } from "./window/tray";

app.setName(APP_NAME);
if (process.platform === "win32") {
  // Windows Toast / 任务栏分组依赖 AppUserModelId
  app.setAppUserModelId(APP_USER_MODEL_ID);
}
// 压制 Chromium EGL/GPU 驱动在 stderr 刷屏（log-level≥3 只留 FATAL）
app.commandLine.appendSwitch("log-level", "3");

/** 从打包资源加载应用图标；macOS 额外设置 Dock 图标。 */
function applyAppIcon() {
  const iconPath = getAppIconPath();
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  if (process.platform === "darwin") {
    app.dock?.setIcon(image);
  }
}

app.whenReady().then(() => {
  loadSettings();
  loadSession();
  openCatalogDb();
  try {
    ensureDefaultWorkspace();
  } catch {
    /* ignore */
  }
  try {
    healRunningSessions();
  } catch {
    /* ignore */
  }
  applyAppIcon();
  applyContentSecurityPolicy();
  ensureWindowsToastShortcut();
  // 托盘「显示窗口」时若主窗口已销毁则重建
  setTrayEnsureWindow(() => {
    if (!getMainWindow() || getMainWindow()?.isDestroyed()) createWindow();
  });
  configureDesktopLog();
  pruneExpiredLogs(getGeneralSettings().logRetentionDays);
  // 跟随系统主题：OS 深浅色变化时同步原生窗口底色
  nativeTheme.on("updated", () => {
    if (getGeneralSettings().uiTheme === "system") {
      syncWindowBackgroundFromSettings();
    }
  });
  const { bridge } = startAgentProcess();
  // 须在 createWindow 之前注册 IPC，以便首帧同步恢复 session
  registerIpc(ipcMain, bridge, {
    onGeneralSaved: () => {
      syncTrayFromSettings();
      syncWindowBackgroundFromSettings();
      // 日志策略（开关 / 保留天数 / 截断）即时生效；dataDir 不走此回调切换
      configureDesktopLog();
      pruneExpiredLogs(getGeneralSettings().logRetentionDays);
      try {
        pushAgentHello(bridge);
      } catch {
        /* agent 未在跑时忽略 */
      }
    },
    onDataDirApplied: () => {
      // 数据目录已切换：重开 catalog/chat、session、日志分片
      openCatalogDb();
      try {
        ensureDefaultWorkspace();
      } catch {
        /* ignore */
      }
      reloadSessionAfterDataDirChange();
      configureDesktopLog();
      pruneExpiredLogs(getGeneralSettings().logRetentionDays);
      try {
        pushAgentHello(bridge);
      } catch {
        /* ignore */
      }
      try {
        broadcastThreadsChanged();
      } catch {
        /* ignore */
      }
    },
  });
  createWindow();
  // 开发态：THINKER_OPEN_DEVTOOLS=1 时打开 DevTools
  startDevToolsPrefsBridge();
  syncTrayFromSettings();

  // 每天再扫一次过期日志
  setInterval(
    () => {
      try {
        pruneExpiredLogs(getGeneralSettings().logRetentionDays);
      } catch {
        /* 清理失败不拖垮主进程 */
      }
    },
    24 * 60 * 60 * 1000,
  );

  app.on("activate", () => {
    // macOS：点击 Dock 图标时恢复或重建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else {
      const win = getMainWindow();
      win?.show();
      win?.focus();
    }
  });
});

app.on("window-all-closed", () => {
  // macOS 惯例：关窗不退出；启用系统托盘时也保持常驻
  if (process.platform === "darwin") return;
  if (!isAppQuitting() && getGeneralSettings().systemTrayIcon) return;
  app.quit();
});

app.on("before-quit", () => {
  try {
    if (healRunningSessions() > 0) broadcastThreadsChanged();
  } catch {
    /* ignore */
  }
  closeLogsDb();
  closeThinkerDb();
});
