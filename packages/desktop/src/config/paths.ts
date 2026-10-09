/**
 * 桌面主进程用到的路径常量与解析。
 *
 * 涵盖 agent 入口、checkpoint 目录、渲染 index.html、各类图标，以及开发态渲染 URL。
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getGeneralSettings } from "./settingsStore";
import {
  bootstrapThinkerDir,
  resolveDataDir,
  resolveLogDir as resolveLogDirUnderData,
} from "./thinkerHome";

/** 兄弟包构建产物目录：`packages/<pkg>/artifacts`。 */
function packageArtifacts(pkg: string): string {
  return path.join(__dirname, "..", "..", pkg, "artifacts");
}

/** Agent utilityProcess 的入口脚本路径（`packages/engine/artifacts/entry.js`）。 */
export function getAgentEntryPath(): string {
  return path.join(packageArtifacts("engine"), "entry.js");
}

/** 用户数据下的 checkpoint 目录。 */
export function getCheckpointDir(): string {
  return path.join(app.getPath("userData"), "checkpoints");
}

/** 当前数据根（可读配置；默认 `~/.thinker`）。 */
export function getDataDir(): string {
  return resolveDataDir(getGeneralSettings().dataDir);
}

/** 日志目录（固定 `<dataDir>/logs`，SQLite 按条数分片）。 */
export function getLogDir(): string {
  return resolveLogDirUnderData(getDataDir());
}

/** 工作空间数据目录：`<dataDir>/workspaces/<id>`。 */
export function getWorkspaceDataDir(workspaceId: string): string {
  return path.join(getDataDir(), "workspaces", workspaceId);
}

/** 工作空间聊天库路径。 */
export function getWorkspaceChatDbPath(workspaceId: string): string {
  return path.join(getWorkspaceDataDir(workspaceId), "chat.db");
}

/** 全局目录库（工作空间元数据 + app_kv）。 */
export function getCatalogDbPath(): string {
  return path.join(getDataDir(), "catalog.db");
}

/**
 * 首次空目录时默认工作空间根：`~/.thinker/workspace`（固定在引导根下）。
 * 可删除；删光后不会自动再创建，除非换到空的 dataDir。
 */
export function getDefaultWorkspaceRoot(): string {
  return path.join(bootstrapThinkerDir(), "workspace");
}

/** 打包后应用渲染入口 `index.html`。 */
export function getAppIndexHtml(): string {
  return path.join(packageArtifacts("renderer"), "index.html");
}

/** 图标文件搜索根：主进程旁目录，以及包内 `resources`。 */
function desktopResourceBases(): string[] {
  return [__dirname, path.join(__dirname, "..", "resources")];
}

/**
 * 按候选文件名在资源根中查找第一个存在的图标路径。
 * 均不存在时回退到 `__dirname` 下第一个候选名（便于报错定位）。
 */
function resolveIcon(names: readonly string[]): string {
  for (const base of desktopResourceBases()) {
    for (const name of names) {
      const candidate = path.join(base, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return path.join(__dirname, names[0]!);
}

/**
 * 应用主图标（圆角；圆角外透明）。
 * 优先使用与打包主进程同目录的副本，开发态回退到 package resources。
 * Windows 优先 `.ico`，其它平台优先圆角 PNG。
 */
export function getAppIconPath(): string {
  const names =
    process.platform === "win32"
      ? (["icon.ico", "icon.png"] as const)
      : (["icon.png", "icon.ico"] as const);
  return resolveIcon(names);
}

/**
 * Start Menu / Toast 标题栏图标——仅头部的 `logo-glyph`（小号 UI 用）。
 * 回退顺序：toast-icon → 主应用图标。
 */
export function getToastShortcutIconPath(): string {
  const names =
    process.platform === "win32"
      ? (["logo-glyph.ico", "toast-icon.ico", "icon.ico", "icon.png"] as const)
      : (["logo-glyph.png", "toast-icon.png", "icon.png", "icon.ico"] as const);
  return resolveIcon(names);
}

/**
 * Linux 系统 Notification 的 `icon`（优先 PNG）。
 * macOS 不要传给 `Notification`：会画成横幅右侧附件，左侧仍是 .app 图标。
 */
export function getNotificationIconPath(): string {
  return resolveIcon(["logo-glyph.png", "toast-icon.png", "icon.png", "icon.ico"]);
}

/** 开发态 Vite 渲染进程 URL（与 CSP / createWindow 共用）。 */
export const DEV_RENDERER_URL = "http://127.0.0.1:5179";
