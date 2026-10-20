/**
 * Workspaces 侧栏纯函数。
 */

/** 工作区折叠时默认展示的会话条数，超出走 More。 */
export const MORE_LIMIT = 8;

/** 从绝对路径取文件夹名（跨平台分隔符） */
export function folderBasename(rootPath: string): string {
  const cleaned = rootPath.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || cleaned;
}
