/**
 * 工作区根路径：由 desktop 经 hello / run / resume 注入；工具执行读此处。
 * 未注入时不得回落到 monorepo / cwd，避免误读写产品工程本身。
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
  normalizeShellAllowlist,
  normalizeShellApprovalMode,
  normalizeWorkspaceAccess,
  type ShellApprovalMode,
  type ShellProfile,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";

let currentRoot: string | null = null;
/** 展示名（别名或文件夹名）；可与 root basename 不同。 */
let currentName: string | null = null;
/** 文件工具对工作区外路径的访问档位。 */
let currentAccess: WorkspaceAccess = DEFAULT_WORKSPACE_ACCESS;
/** 是否允许 AI 调用 delete_file；与设置默认一致。 */
let allowAiDeleteFiles = true;
/** 是否允许 AI shell 工具。 */
let allowAiShell = true;
/** 是否允许 AI 内置浏览器工具。 */
let allowAiBrowser = true;
let shellApprovalMode: ShellApprovalMode = DEFAULT_SHELL_APPROVAL_MODE;
let shellAllowlist: string[] = [...DEFAULT_SHELL_ALLOWLIST];
/** 当前 shell 事实（供 environment_context）。 */
let currentShell: ShellProfile | null = null;

export type SetWorkspaceRootOptions = {
  /** 工作区显示名；省略则用文件夹名。 */
  name?: string | null;
};

/** 设置当前工作区根；校验目录存在。空值会清空当前根。 */
export function setWorkspaceRoot(
  rootPath: string | undefined | null,
  options?: SetWorkspaceRootOptions,
): string {
  if (!rootPath?.trim()) {
    currentRoot = null;
    currentName = null;
    throw new Error("Workspace root is required.");
  }
  const resolved = path.resolve(rootPath.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Workspace root does not exist: ${resolved}`);
  }
  currentRoot = resolved;
  const named = options?.name?.trim();
  currentName = named || path.basename(resolved) || "Workspace";
  return currentRoot;
}

/** 供工具执行读取的当前工作区根。 */
export function getWorkspaceRoot(): string {
  if (!currentRoot) {
    throw new Error("No workspace root configured. Open a workspace before using tools.");
  }
  return currentRoot;
}

/** 环境上下文用：未配置时返回 null，不抛错。 */
export function getWorkspaceRootOrNull(): string | null {
  return currentRoot;
}

/** 当前工作区显示名；未配置时 null。 */
export function getWorkspaceName(): string | null {
  return currentName;
}

/** 设置工作区外访问档位（hello / run / resume 下发）。 */
export function setWorkspaceAccess(mode: WorkspaceAccess | undefined | null): WorkspaceAccess {
  currentAccess = normalizeWorkspaceAccess(mode, DEFAULT_WORKSPACE_ACCESS);
  return currentAccess;
}

/** 当前工作区外访问档位。 */
export function getWorkspaceAccess(): WorkspaceAccess {
  return currentAccess;
}

/** 设置是否允许 AI 删除文件（hello / run / resume 下发）。 */
export function setAllowAiDeleteFiles(value: boolean | undefined | null): boolean {
  if (typeof value === "boolean") allowAiDeleteFiles = value;
  return allowAiDeleteFiles;
}

/** 当前是否允许 AI 删除文件。 */
export function getAllowAiDeleteFiles(): boolean {
  return allowAiDeleteFiles;
}

/** 设置是否允许 AI shell。 */
export function setAllowAiShell(value: boolean | undefined | null): boolean {
  if (typeof value === "boolean") allowAiShell = value;
  return allowAiShell;
}

export function getAllowAiShell(): boolean {
  return allowAiShell;
}

/** 设置是否允许 AI 内置浏览器工具。 */
export function setAllowAiBrowser(value: boolean | undefined | null): boolean {
  if (typeof value === "boolean") allowAiBrowser = value;
  return allowAiBrowser;
}

export function getAllowAiBrowser(): boolean {
  return allowAiBrowser;
}

/** 设置命令行审批模式。 */
export function setShellApprovalMode(mode: ShellApprovalMode | undefined | null): ShellApprovalMode {
  if (mode) shellApprovalMode = normalizeShellApprovalMode(mode);
  return shellApprovalMode;
}

export function getShellApprovalMode(): ShellApprovalMode {
  return shellApprovalMode;
}

/** 设置白名单（完整替换）。 */
export function setShellAllowlist(list: string[] | undefined | null): string[] {
  if (list) shellAllowlist = normalizeShellAllowlist(list);
  return shellAllowlist;
}

export function getShellAllowlist(): string[] {
  return shellAllowlist;
}

/** HITL「加入白名单」时进程内即时追加。 */
export function addShellAllowlistToken(token: string): void {
  const t = token.trim().toLowerCase();
  if (!t || shellAllowlist.includes(t)) return;
  shellAllowlist = [...shellAllowlist, t];
}

/** 设置当前 shell profile 事实。 */
export function setShellProfile(profile: ShellProfile | undefined | null): void {
  currentShell = profile ?? null;
}

export function getShellProfile(): ShellProfile | null {
  return currentShell;
}

/** @deprecated 兼容旧引用；请用 getWorkspaceRoot()。 */
export const WORKSPACE_ROOT = "";
