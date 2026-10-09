/**
 * 线程侧栏元数据。
 * 桌面权威源在 SQLite；engine 内存 ThreadStore 保持兼容形状子集。
 */
export type ThreadMeta = {
  id: string;
  title: string;
  updatedAt: number;
  sessionId?: string;
  workspaceId?: string;
  pinned?: boolean;
  sortOrder?: number;
  runStatus?: "idle" | "running" | "interrupted" | "failed";
};
