/**
 * 工作空间 Git 写操作面（只读检视类型在 `workspaceFs.ts`，两者不重复）。
 *
 * 契约要点：
 * - 入参一律工作空间相对 posix 路径，主进程侧再拼到工作区根并做越界校验。
 * - 返回值统一为 `GitMutationResult`：不抛异常到渲染层，失败带可直接展示的 `error`。
 * - 远程操作（push / pull）不实现凭证托管，失败时透传 git 原文，引导用户去系统终端处理。
 */

/** Git 写操作的失败分类（UI 据此给不同提示，不直接展示裸 code）。 */
export type GitMutationCode =
  | "ok"
  | "not_found"
  | "not_a_repo"
  | "cwd_missing"
  | "timeout"
  | "rejected"
  | "conflict"
  | "no_upstream"
  | "nothing_to_commit"
  | "error";

/** 写操作的统一返回：成功 `ok: true`；失败 `ok: false` 且带 `code` 与 `error`。 */
export type GitMutationResult = {
  ok: boolean;
  /** 失败分类；成功时为 `"ok"`。 */
  code: GitMutationCode;
  /** 面向用户的错误说明（已归一，非裸 stderr）。 */
  error?: string;
  /** 诊断细节（技术原文，截断后仅供排查，UI 折叠展示）。 */
  detail?: string;
};

/** 分支信息。 */
export type GitBranch = {
  name: string;
  /** 是否为当前分支。 */
  current: boolean;
  /** 上游分支名（无上游时为 null）。 */
  upstream: string | null;
  ahead: number;
  behind: number;
};

/** stash 条目。 */
export type GitStashEntry = {
  /** `stash@{n}` 的序号。 */
  index: number;
  branch: string;
  message: string;
};

/** 暂存 / 取消暂存 / 放弃更改的入参路径分组是否允许为空（全量语义在此显式禁止）。 */
export type GitPathsInput = {
  workspaceId: string;
  /** 相对路径列表；不得为空（空数组表示「未选中」，由主进程拒绝）。 */
  paths: string[];
};

/** 提交入参。 */
export type GitCommitInput = {
  workspaceId: string;
  message: string;
  /** 是否提交全部已跟踪改动（`-a`）；默认只提交暂存区。 */
  all?: boolean;
  /** 修正上一次提交（`--amend`）。 */
  amend?: boolean;
};

/** 提交成功回执。 */
export type GitCommitResult = GitMutationResult & {
  /** 提交号缩写。 */
  commit?: string;
  branch?: string;
};

/** 检出（分支切换 / 文件还原）入参。 */
export type GitCheckoutInput = {
  workspaceId: string;
  /** 分支名或 ref；省略项目树还原走整体 ref。 */
  ref?: string;
  /** 仅还原指定路径（`git checkout -- <path>`）；省略则切分支。 */
  paths?: string[];
};

/** push 入参。 */
export type GitPushInput = {
  workspaceId: string;
  remote?: string;
  branch?: string;
  /** 是否设置上游（`-u`）。 */
  setUpstream?: boolean;
};

/** pull 入参。 */
export type GitPullInput = {
  workspaceId: string;
  remote?: string;
  branch?: string;
  /** 是否变基（`--rebase`）。 */
  rebase?: boolean;
};

/** stash 入参。 */
export type GitStashInput = {
  workspaceId: string;
  message?: string;
  /** pop / apply 的目标序号；省略默认栈顶。 */
  index?: number;
  /** 是否包含未跟踪文件（`-u`）。 */
  includeUntracked?: boolean;
};

/** stash push 回执。 */
export type GitStashResult = GitMutationResult & {
  entries?: GitStashEntry[];
};

/** Preload 暴露的 Git 写操作 API（只读检视在 `ThinkerWorkspaceFsApi`）。 */
export type ThinkerGitApi = {
  stage(workspaceId: string, paths: string[]): Promise<GitMutationResult>;
  unstage(workspaceId: string, paths: string[]): Promise<GitMutationResult>;
  /** 放弃工作区改动（`git checkout -- <paths>`）。 */
  discard(workspaceId: string, paths: string[]): Promise<GitMutationResult>;
  /** 提交暂存区（或 `-a` 全量跟踪改动）。 */
  commit(input: GitCommitInput): Promise<GitCommitResult>;
  /** 切分支或还原指定路径。 */
  checkout(input: GitCheckoutInput): Promise<GitMutationResult>;
  branchList(workspaceId: string): Promise<{ ok: boolean; branches: GitBranch[]; error?: string }>;
  push(input: GitPushInput): Promise<GitMutationResult>;
  pull(input: GitPullInput): Promise<GitMutationResult>;
  stashPush(input: GitStashInput): Promise<GitStashResult>;
  stashPop(input: GitStashInput): Promise<GitMutationResult>;
};

/** 成功回执构造（避免各处手写同一字面量）。 */
export function okMutation(): GitMutationResult {
  return { ok: true, code: "ok" };
}

/** 失败回执构造：`detail` 已截断，避免整段 stderr 进 UI。 */
export function failMutation(
  code: GitMutationCode,
  error: string,
  detail?: string,
): GitMutationResult {
  const trimmed = (detail ?? "").trim();
  return {
    ok: false,
    code,
    error,
    ...(trimmed ? { detail: trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed } : {}),
  };
}

/** 将 `git.ts` 的裸失败结果映射为写操作分类。 */
export function classifyMutationFailure(args: {
  notFound: boolean;
  code: number;
  stderr: string;
  cwdMissing?: boolean;
}): GitMutationCode {
  if (args.cwdMissing) return "cwd_missing";
  if (args.notFound) return "not_found";
  if (args.code === 124) return "timeout";
  const text = args.stderr.toLowerCase();
  if (text.includes("not a git repository")) return "not_a_repo";
  if (text.includes("no upstream branch") || text.includes("no configured push destination")) {
    return "no_upstream";
  }
  if (text.includes("nothing to commit")) return "nothing_to_commit";
  if (text.includes("could not resolve") || text.includes("authentication failed")) {
    return "rejected";
  }
  if (text.includes("conflict") || text.includes("would be overwritten")) return "conflict";
  return "error";
}
