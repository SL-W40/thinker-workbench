/** 已移除的编辑器侧栏文件树，宽度仍留在 inspector UI 存储里。 */

export const FILE_LIST_WIDTH = {
  default: 260,
  min: 180,
  max: 480,
} as const;

export function clampFileListWidth(n: number): number {
  return Math.min(FILE_LIST_WIDTH.max, Math.max(FILE_LIST_WIDTH.min, Math.round(n)));
}
