/**
 * 工作空间 FS / Git 桥接（右侧栏 Files / Changes）。
 */
import type {
  GitFileDiff,
  GitStatus,
  WorkspaceFile,
  WorkspaceNode,
} from "@thinker-workbench/shared";

function api() {
  return window.thinker?.workspaceFs;
}

function requireApi() {
  const fs = api();
  if (!fs) throw new Error("Workspace FS API unavailable.");
  return fs;
}

/** 目录树。 */
export function workspaceTree(workspaceId: string): Promise<WorkspaceNode> {
  return requireApi().tree(workspaceId);
}

/** 读文件。 */
export function workspaceReadFile(workspaceId: string, path: string): Promise<WorkspaceFile> {
  return requireApi().readFile(workspaceId, path);
}

/** 写文件。 */
export function workspaceWriteFile(
  workspaceId: string,
  path: string,
  content: string,
): Promise<void> {
  return requireApi().writeFile(workspaceId, path, content);
}

/** Git status。 */
export function workspaceGitStatus(workspaceId: string): Promise<GitStatus> {
  return requireApi().gitStatus(workspaceId);
}

/** 单文件 diff。 */
export function workspaceGitFileDiff(
  workspaceId: string,
  path: string,
  full?: boolean,
): Promise<GitFileDiff> {
  return requireApi().gitFileDiff(workspaceId, path, full);
}

/** git init。 */
export function workspaceGitInit(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  return requireApi().gitInit(workspaceId);
}

/** 新建目录。 */
export function workspaceMkdir(workspaceId: string, path: string): Promise<void> {
  return requireApi().mkdir(workspaceId, path);
}

/** 重命名 / 同工作空间内移动。 */
export function workspaceRename(workspaceId: string, from: string, to: string): Promise<void> {
  return requireApi().rename(workspaceId, from, to);
}

/** 删除文件或目录（主进程优先走系统回收站）。 */
export function workspaceRemove(workspaceId: string, path: string): Promise<void> {
  return requireApi().remove(workspaceId, path);
}

/** 在系统文件管理器中定位。 */
export function workspaceReveal(workspaceId: string, path: string): Promise<void> {
  return requireApi().reveal(workspaceId, path);
}
