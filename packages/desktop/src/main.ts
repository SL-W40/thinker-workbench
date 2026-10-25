/**
 * Electron 主进程入口。
 *
 * 负责：应用标识与图标、加载 settings/session、注入 CSP、启动 agent utilityProcess、
 * 注册 IPC、创建主窗口与托盘，以及 macOS activate / 全窗口关闭时的退出策略。
 */
import { app, ipcMain, nativeImage, nativeTheme } from "electron";
import { runLedger } from "./agent/runLedger";
import { runCacheRetention } from "./cache/purgeCacheDirs";
import { APP_NAME, APP_USER_MODEL_ID } from "./config/appIdentity";
import { reloadSessionAfterDataDirChange } from "./config/dataDirMigrate";
import { getAppIconPath } from "./config/paths";
import { loadSession } from "./config/sessionStore";
import { getGeneralSettings, loadSettings } from "./config/settingsStore";
import { ensureBundledCustomize } from "./customize/ensureBundledCustomize";
import { backfillRunDurations } from "./db/runDurationBackfill";
import { closeThinkerDb, openCatalogDb } from "./db/thinkerDb";
import { ensureDefaultWorkspace, healRunningSessions } from "./db/workspacesStore";
import { registerIpc } from "./ipc/register";
import { initUpdateModule } from "./ipc/updateHandlers";
import { broadcastThreadsChanged } from "./ipc/workspacesHandlers";
import { configureDesktopLog } from "./log/setup";
import { ensureWindowsToastShortcut } from "./notify/windowsToastShortcut";
import { applyContentSecurityPolicy } from "./security/csp";
import { ensureBundledSkills } from "./skills/ensureBundledSkills";
import { terminalSessionManager } from "./terminal/TerminalSessionManager";
import { pruneTraceStore } from "./trace/pruneTraceSessions";
import { closeAllTraceDbs } from "./trace/workspaceTraceDb";
import { pushAgentHello, startAgentProcess } from "./utility/startAgentProcess";
import { createWindow, syncWindowBackgroundFromSettings } from "./window/createWindow";
import { startDevParentWatch } from "./window/devParentWatch";
import { startDevToolsPrefsBridge } from "./window/devToolsEnv";
import { isAppQuitting, setTrayEnsureWindow, syncTrayFromSettings } from "./window/tray";

/** whenReady 后赋值；before-quit 停掉 utility 自动重启。 */
let stopAgentProcess: (() => void) | null = null;

app.setName(APP_NAME);
if (process.platform === "win32") {
  // Windows Toast / 任务栏分组依赖 AppUserModelId
  app.setAppUserModelId(APP_USER_MODEL_ID);
}
// 压制 Chromium EGL/GPU 驱动在 stderr 刷屏（log-level≥3 只留 FATAL）
app.commandLine.appendSwitch("log-level", "3");

/**
 * 单实例：上次 `pnpm:dev` 未干净退出时常见孤儿 Electron，再启动会多一个空窗。
 * 未抢到锁则立刻退出；二次启动则 ensure 主窗（createWindow 幂等，只聚焦不叠窗）。
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

app.on("second-instance", () => {
  if (!gotSingleInstanceLock) return;
  // whenReady 尚未完成时勿建窗，避免与首启 createWindow 竞态叠窗
  if (!app.isReady()) return;
  createWindow();
});

/** 从打包资源加载应用图标；macOS 额外设置 Dock 图标。 */
function applyAppIcon() {
  const iconPath = getAppIconPath();
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  if (process.platform === "darwin") {
    app.dock?.setIcon(image);
  }
}

// 未抢到锁时上面已 exit；仍注册 whenReady 无害（进程即将退出）
app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
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
  // 历史消息缺 durationMs 的按 trace spans 回填一次（幂等，失败不挡启动）
  try {
    backfillRunDurations();
  } catch {
    /* ignore */
  }
  // 内置 skills / rules / agents / mcps → dataDir（已存在则跳过）
  try {
    ensureBundledSkills();
  } catch {
    /* ignore */
  }
  try {
    ensureBundledCustomize();
  } catch {
    /* ignore */
  }
  applyAppIcon();
  applyContentSecurityPolicy();
  ensureWindowsToastShortcut();
  // 托盘「显示窗口」：createWindow 幂等（已有则聚焦）
  setTrayEnsureWindow(() => {
    createWindow();
  });
  // 开发态：包装进程被强杀时随父进程退出，避免孤儿占锁
  startDevParentWatch();
  configureDesktopLog();
  // 可再生缓存按保留策略清一次（截图等派生数据）
  try {
    runCacheRetention();
  } catch {
    /* ignore */
  }
  // 跟随系统主题：OS 深浅色变化时同步原生窗口底色
  nativeTheme.on("updated", () => {
    if (getGeneralSettings().uiTheme === "system") {
      syncWindowBackgroundFromSettings();
    }
  });
  const agent = startAgentProcess();
  stopAgentProcess = agent.stop;
  const { bridge } = agent;
  // 更新模块：dev 构建内部自动禁用，任何失败都不阻断启动
  initUpdateModule();
  // 须在 createWindow 之前注册 IPC，以便首帧同步恢复 session
  registerIpc(ipcMain, bridge, {
    onGeneralSaved: () => {
      syncTrayFromSettings();
      syncWindowBackgroundFromSettings();
      // 日志策略（开关 / 保留天数 / 截断）即时生效；dataDir 不走此回调切换
      configureDesktopLog();
      // 蒙层现在是渲染层 DOM（<webview> 之上），配色随主题自动跟随，无需刷新
      try {
        pushAgentHello(bridge);
      } catch {
        /* agent 未在跑时忽略 */
      }
      // 调高并行上限后立刻把队头放进空槽；调低不抢占已在跑的会话
      try {
        runLedger.pump();
      } catch {
        /* ignore */
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
      try {
        ensureBundledSkills();
      } catch {
        /* ignore */
      }
      try {
        ensureBundledCustomize();
      } catch {
        /* ignore */
      }
      reloadSessionAfterDataDirChange();
      configureDesktopLog();
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

  // 每天再扫一次可再生缓存（截图）、过期 Trace 与文件检查点
  setInterval(
    () => {
      try {
        runCacheRetention();
      } catch {
        /* 清理失败不拖垮主进程 */
      }
      try {
        pruneTraceStore();
      } catch {
        /* ignore */
      }
    },
    24 * 60 * 60 * 1000,
  );

  app.on("activate", () => {
    // macOS：点击 Dock 图标时确保主窗（仅有辅助窗时也会重建主窗）
    createWindow();
  });
});

app.on("window-all-closed", () => {
  // macOS 惯例：关窗不退出；启用系统托盘时也保持常驻
  if (process.platform === "darwin") return;
  if (!isAppQuitting() && getGeneralSettings().systemTrayIcon) return;
  app.quit();
});

app.on("before-quit", () => {
  // 停掉 utility 自动重启，再撕 PTY；残留 node-pty 在新 macOS 上易 SIGABRT
  try {
    stopAgentProcess?.();
  } catch {
    /* ignore */
  }
  try {
    terminalSessionManager.disposeAll();
  } catch {
    /* ignore */
  }
  try {
    if (healRunningSessions() > 0) broadcastThreadsChanged();
  } catch {
    /* ignore */
  }
  try {
    runCacheRetention();
  } catch {
    /* ignore */
  }
  closeAllTraceDbs();
  closeThinkerDb();
});
