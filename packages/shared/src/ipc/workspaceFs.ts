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
  /**
   * 路径不存在或不是文件时为 true（不抛错，避免恢复已删标签时刷主进程错误日志）。
   * 此时 content 为空，勿当可读文件处理。
   */
  missing?: boolean;
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

/**
 * Git 状态失败分类：UI 按它选文案，不再直接展示 stderr。
 * - `not_a_repo`：目录不在仓库里（引导初始化 / 换目录）
 * - `git_not_found`：PATH 里没有 git
 * - `cwd_missing`：工作空间目录已被移走 / 删除
 * - `timeout`：git 子进程超时
 * - `git_error`：兜底（细节放 `detail`，UI 折叠展示）
 */
export type GitStatusReason =
  | "ok"
  | "not_a_repo"
  | "git_not_found"
  | "cwd_missing"
  | "timeout"
  | "git_error";

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
  /** 失败时的技术细节（诊断展示用；成功或缺省时为空）。 */
  detail?: string;
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
  /** 新建目录（父目录自动创建）；已存在则报错。 */
  mkdir(workspaceId: string, path: string): Promise<void>;
  /** 重命名或同工作空间内移动；目标已存在则报错。 */
  rename(workspaceId: string, from: string, to: string): Promise<void>;
  /** 删除文件或目录；优先走系统回收站，便于误删恢复。 */
  remove(workspaceId: string, path: string): Promise<void>;
  /** 在系统文件管理器中定位该项。 */
  reveal(workspaceId: string, path: string): Promise<void>;
};
