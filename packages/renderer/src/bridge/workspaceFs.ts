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
export function workspaceGitInit(
  workspaceId: string,
): Promise<{ ok: boolean; error?: string }> {
  return requireApi().gitInit(workspaceId);
}
