/**
 * 桌面主进程用到的路径常量与解析。
 *
 * 打包态：`Resources/payload` + layout.json；开发态：monorepo 各包 artifacts。
 * 业务侧优先 `resolveAppPaths()`，避免手写兄弟包相对路径。
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  type AppPaths,
  appPathsFromPayloadRoot,
  monorepoAppPaths,
  PAYLOAD_DIR_NAME,
  readAppLayoutFile,
} from "../packaging/appLayout";
import { getGeneralSettings } from "./settingsStore";
import {
  bootstrapThinkerDir,
  resolveDataDir,
  resolveLogDir as resolveLogDirUnderData,
} from "./thinkerHome";

/** 缓存：同进程内 layout 不变。 */
let cachedPaths: AppPaths | null = null;

/**
 * 解析应用资源绝对路径（renderer / engine / bundled / icons）。
 * 打包态读 `process.resourcesPath/payload/layout.json`；开发态指向 monorepo artifacts。
 */
export function resolveAppPaths(): AppPaths {
  if (cachedPaths) return cachedPaths;
  cachedPaths = app.isPackaged ? resolvePackagedAppPaths() : resolveMonorepoAppPaths();
  return cachedPaths;
}

/** 仅测试用：清空路径缓存。 */
export function resetAppPathsCacheForTests(): void {
  cachedPaths = null;
}

/** 仅测试用：注入 AppPaths（含图标搜索根）。 */
export function setAppPathsForTests(paths: AppPaths): void {
  cachedPaths = paths;
}

function resolveMonorepoAppPaths(): AppPaths {
  const desktopArtifacts = __dirname;
  const packagesRoot = path.join(__dirname, "..", "..");
  return monorepoAppPaths(desktopArtifacts, packagesRoot);
}

function resolvePackagedAppPaths(): AppPaths {
  const payloadRoot = path.join(process.resourcesPath, PAYLOAD_DIR_NAME);
  const layoutPath = path.join(payloadRoot, "layout.json");
  if (!fs.existsSync(layoutPath)) {
    throw new Error(`Missing packaged layout: ${layoutPath}`);
  }
  const layout = readAppLayoutFile(layoutPath);
  // Shell asar 内也可能有图标副本（解锁/早期窗口用）
  return appPathsFromPayloadRoot(payloadRoot, layout, [__dirname]);
}

/** Agent utilityProcess 的入口脚本路径。 */
export function getAgentEntryPath(): string {
  return resolveAppPaths().engineEntry;
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

/** 工作空间用户附图目录：`<dataDir>/workspaces/<id>/images`。 */
export function getWorkspaceImagesDir(workspaceId: string): string {
  return path.join(getWorkspaceDataDir(workspaceId), "images");
}

/** 全局目录库（工作空间元数据 + app_kv）。 */
export function getCatalogDbPath(): string {
  return path.join(getDataDir(), "catalog.db");
}

/** 会话 Trace 根目录（trace.db + sessions jsonl）。 */
export function getTraceDir(): string {
  return path.join(getDataDir(), "trace");
}

/** 打包内置 skills 资源目录；不存在时返回 null。 */
export function getBundledSkillsDir(): string | null {
  const dir = path.join(resolveAppPaths().bundledRoot, "skills");
  if (fs.existsSync(dir)) return dir;
  // 开发态：artifacts 尚未 copy 时回退源 resources
  if (!app.isPackaged) {
    const fallback = path.join(__dirname, "..", "resources", "skills");
    return fs.existsSync(fallback) ? fallback : null;
  }
  return null;
}

/**
 * 内置 Customize 目录（rules / agents / mcps）。
 * 打包态在 payload/bundled；开发态优先 artifacts，再 resources。
 */
export function getBundledCustomizeDir(kind: "rules" | "agents" | "mcps"): string | null {
  const primary = path.join(resolveAppPaths().bundledRoot, kind);
  if (fs.existsSync(primary) && fs.statSync(primary).isDirectory()) return primary;
  if (!app.isPackaged) {
    const fallback = path.join(__dirname, "..", "resources", kind);
    if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) return fallback;
  }
  return null;
}

/**
 * 首次空目录时默认工作空间根：`~/.thinker/workspace`（固定在引导根下）。
 * 可删除；删光后不会自动再创建，除非换到空的 dataDir。
 */
export function getDefaultWorkspaceRoot(): string {
  return path.join(bootstrapThinkerDir(), "workspace");
}

/** 应用渲染入口 `index.html`（打包态为 payload 内文件；开发窗口通常走 Vite URL）。 */
export function getAppIndexHtml(): string {
  return resolveAppPaths().rendererIndexHtml;
}

/**
 * OS 图标子目录：Windows 用旧版大图标（`win/`），macOS 用新版（`mac/`）。
 * Linux 先试 `mac/`，再回落 `win/`。
 */
function iconPlatformDirs(): readonly string[] {
  if (process.platform === "win32") return ["win"];
  if (process.platform === "darwin") return ["mac"];
  return ["mac", "win"];
}

/**
 * 按候选文件名在资源根中查找第一个存在的图标路径。
 * 优先 `win/` / `mac/` 平台子目录，再回落根目录（如共享 `logo-glyph`）。
 * 均不存在时回退到第一个搜索根下第一个候选名（便于报错定位）。
 */
function resolveIcon(names: readonly string[]): string {
  const roots = resolveAppPaths().iconSearchRoots;
  const platformDirs = iconPlatformDirs();
  for (const base of roots) {
    for (const dir of platformDirs) {
      for (const name of names) {
        const candidate = path.join(base, dir, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  for (const base of roots) {
    for (const name of names) {
      const candidate = path.join(base, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const fallbackRoot = roots[0] ?? __dirname;
  const platform = platformDirs[0];
  if (platform && names[0]) {
    return path.join(fallbackRoot, platform, names[0]);
  }
  return names[0] ? path.join(fallbackRoot, names[0]) : path.join(fallbackRoot, "icon.png");
}

/**
 * 应用主图标（圆角；圆角外透明）。
 * Windows 优先 `.ico`（旧版大图标），其它平台优先 PNG。
 */
export function getAppIconPath(): string {
  const names =
    process.platform === "win32"
      ? (["icon.ico", "icon.png"] as const)
      : (["icon.png", "icon.ico"] as const);
  return resolveIcon(names);
}

/**
 * Start Menu / 任务栏快捷方式图标（完整 app icon，避免用 glyph 被 Windows 缓存成旧图）。
 * 回退：toast-icon → logo-glyph → png。
 */
export function getToastShortcutIconPath(): string {
  const names =
    process.platform === "win32"
      ? (["icon.ico", "toast-icon.ico", "logo-glyph.ico", "icon.png"] as const)
      : (["icon.png", "toast-icon.png", "logo-glyph.png", "icon.ico"] as const);
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
