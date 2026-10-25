/**
 * 桌面主进程用到的路径常量与解析。
 *
 * 打包态：`Resources/payload` + layout.json；开发态：monorepo 各包 artifacts。
 * 业务侧优先 `resolveAppPaths()`，避免手写兄弟包相对路径。
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WORKSPACE_ID, dataPath } from "@thinker-workbench/shared";
import { app } from "electron";
import {
  type AppPaths,
  appPathsFromPayloadRoot,
  monorepoAppPaths,
  PAYLOAD_DIR_NAME,
  readAppLayoutFile,
} from "../packaging/appLayout";
import { getGeneralSettings } from "./settingsStore";
import { resolveDataDir } from "./thinkerHome";

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

/** 当前数据根（可读配置；默认 `~/.thinker`）。 */
export function getDataDir(): string {
  return resolveDataDir(getGeneralSettings().dataDir);
}

/** 工作空间数据根：`<dataDir>/workspaces`。 */
export function getWorkspacesRoot(): string {
  return dataPath(getDataDir(), "workspacesRoot");
}

/** 工作空间数据目录：`<dataDir>/workspaces/<id>`。 */
export function getWorkspaceDataDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsData", { workspaceId });
}

/** 工作空间聊天库路径。 */
export function getWorkspaceChatDbPath(workspaceId: string): string {
  return dataPath(getDataDir(), "wsChatDb", { workspaceId });
}

/** 工作空间用户附图目录：`<dataDir>/workspaces/<id>/images`。 */
export function getWorkspaceImagesDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsImages", { workspaceId });
}

/** 工作空间文件附件目录：`<dataDir>/workspaces/<id>/attachments`。 */
export function getWorkspaceAttachmentsDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsAttachments", { workspaceId });
}

/** 工作空间运行检查点目录：`<dataDir>/workspaces/<id>/checkpoints`。 */
export function getWorkspaceCheckpointDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsCheckpoints", { workspaceId });
}

/** 工作空间 Trace 根目录：`<dataDir>/workspaces/<id>/trace`。 */
export function getWorkspaceTraceDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsTrace", { workspaceId });
}

/** 工作空间 Trace 索引库。 */
export function getWorkspaceTraceDbPath(workspaceId: string): string {
  return dataPath(getDataDir(), "wsTraceDb", { workspaceId });
}

/** 工作空间 Trace 载荷目录（sessions jsonl）。 */
export function getWorkspaceTraceSessionsDir(workspaceId: string): string {
  return dataPath(getDataDir(), "wsTraceSessions", { workspaceId });
}

/** 工作空间会话记忆库。 */
export function getWorkspaceMemoryDbPath(workspaceId: string): string {
  return dataPath(getDataDir(), "wsMemory", { workspaceId });
}

/** 全局目录库（工作空间元数据 + app_kv）。 */
export function getCatalogDbPath(): string {
  return dataPath(getDataDir(), "catalogDb");
}

/** 窗口会话文件：`<dataDir>/state/session.json`。 */
export function getSessionFilePath(): string {
  return dataPath(getDataDir(), "sessionFile");
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
 * 内置默认工作空间的磁盘根：`<dataDir>/workspaces/ws_default/project`。
 * id 固定，随 dataDir 走；不可删除，只能清空会话。
 */
export function getDefaultWorkspaceRoot(): string {
  return dataPath(getDataDir(), "wsProject", { workspaceId: DEFAULT_WORKSPACE_ID });
}

/**
 * 全局 Customize 目录：`<dataDir>/customize/<kind>`。
 * 工作区级 Customize 仍在 `<工作区根>/.thinker/<kind>`。
 */
const CUSTOMIZE_KEYS = {
  rules: "customRules",
  skills: "customSkills",
  agents: "customAgents",
  mcps: "customMcps",
} as const;

export function getCustomizeDir(kind: "rules" | "skills" | "agents" | "mcps"): string {
  return dataPath(getDataDir(), CUSTOMIZE_KEYS[kind]);
}

/** 缓存目录：`<dataDir>/cache/<name>`（可再生，按保留策略清理）。 */
export function getCacheDir(name: "browser-screenshots" | "computer-images"): string {
  return dataPath(
    getDataDir(),
    name === "browser-screenshots" ? "cacheBrowserScreenshots" : "cacheComputerImages",
  );
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
