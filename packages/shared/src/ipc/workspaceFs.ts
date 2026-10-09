/**
 * 工作空间文件系统 / Git 只读检视面（右侧栏 Files / Changes）。
 * 路径均为工作空间相对 posix 路径；根用 `"."`。
 */

/** 目录树节点。 */
export type WorkspaceNode = {
  name: string;
  /** 相对工作空间根；根自身为 `"."`。 */
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: WorkspaceNode[];
};

/** 可在右侧栏预览的媒体类型。 */
export type WorkspaceMediaKind = "image" | "audio" | "video";

/** 读取文件结果。 */
export type WorkspaceFile = {
  path: string;
  content: string;
  size: number;
  binary: boolean;
  editable: boolean;
  /** 媒体预览类型；非媒体为 null/省略。 */
  mediaKind?: WorkspaceMediaKind | null;
  /** MIME（媒体预览用）。 */
  mimeType?: string | null;
  /**
   * data URL 预览载荷；超限时为 null（仍带 mediaKind，供 UI 提示过大）。
   * 非媒体文件省略。
   */
  previewDataUrl?: string | null;
};

/** Git 变更文件。 */
export type GitChangedFile = {
  path: string;
  status: string;
  added: number;
  removed: number;
};

export type GitStatusReason = "ok" | "not_a_repo" | "git_not_found" | "git_error";

/** `git status` 摘要。 */
export type GitStatus = {
  isRepo: boolean;
  gitAvailable: boolean;
  reason: GitStatusReason;
  branch: string | null;
  isDefaultBranch: boolean;
  ahead: number;
  behind: number;
  files: GitChangedFile[];
  totals: { added: number; removed: number };
};

/** 单文件 unified diff。 */
export type GitFileDiff = {
  path: string;
  patch: string;
  binary: boolean;
};

/** Preload 暴露的工作空间 FS / Git API。 */
export type ThinkerWorkspaceFsApi = {
  tree(workspaceId: string): Promise<WorkspaceNode>;
  readFile(workspaceId: string, path: string): Promise<WorkspaceFile>;
  writeFile(workspaceId: string, path: string, content: string): Promise<void>;
  gitStatus(workspaceId: string): Promise<GitStatus>;
  gitFileDiff(workspaceId: string, path: string, full?: boolean): Promise<GitFileDiff>;
  gitInit(workspaceId: string): Promise<{ ok: boolean; error?: string }>;
};
