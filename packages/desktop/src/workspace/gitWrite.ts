/**
 * 工作空间 Git 写操作：stage / unstage / discard / commit / checkout / branch / push / pull / stash。
 *
 * 与检视侧（`git.ts`）共用同一个执行器与错误归一，只负责「写」这一半：
 * - 入参路径一律工作空间相对 posix 路径，越界直接拒绝（不等 git 报错）
 * - 结果统一为 ` GitMutationResult`，不向外抛异常
 * - push / pull 不做凭证托管：失败时把 git 原文截断后透给用户，引导去系统终端处理
 */
import type {
  GitBranch,
  GitCommitInput,
  GitCommitResult,
  GitMutationResult,
  GitPullInput,
  GitPushInput,
  GitStashEntry,
  GitStashInput,
  GitStashResult,
} from "@thinker-workbench/shared";
import { classifyMutationFailure, failMutation, okMutation } from "@thinker-workbench/shared";
import { type GitExecResult, runGit } from "./git";

/** push / pull 走网络，放宽到 60s；其余写操作沿用默认 20s。 */
const REMOTE_TIMEOUT_MS = 60_000;

/** 单次写操作允许的路径数量上限，避免误传整棵树。 */
const MAX_PATHS = 400;

/**
 * 路径归一与安全校验：拒绝绝对路径、`..` 越界、空路径。
 * 返回归一化后的相对路径列表；任一非法都整体拒绝（不做部分执行）。
 */
export function sanitizeGitPaths(paths: unknown): string[] | null {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  if (paths.length > MAX_PATHS) return null;
  const out: string[] = [];
  for (const raw of paths) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.startsWith("..") || normalized.includes("/../")) return null;
    if (/^[a-zA-Z]:/.test(normalized)) return null;
    out.push(normalized);
  }
  return out;
}

/** 把执行结果转成写操作回执（复用契约层的失败分类）。 */
function toMutation(res: GitExecResult, fallbackError: string): GitMutationResult {
  if (res.ok) return okMutation();
  const cwdMissing = /工作空间目录不存在/.test(res.stderr);
  const code = classifyMutationFailure({
    notFound: res.notFound,
    code: res.code,
    stderr: res.stderr,
    cwdMissing,
  });
  return failMutation(code, summarize(code, fallbackError), res.stderr);
}

/** 按失败分类给一句可展示的说明（细节另放 detail）。 */
function summarize(code: string, fallbackError: string): string {
  switch (code) {
    case "cwd_missing":
      return "工作空间目录不存在";
    case "not_found":
      return "没有找到 Git，请先安装并把 git 加入 PATH";
    case "not_a_repo":
      return "当前工作空间不是 Git 仓库";
    case "timeout":
      return "Git 操作超时";
    case "no_upstream":
      return "当前分支没有上游分支，请先在终端设置上游后再推送";
    case "nothing_to_commit":
      return "没有可提交的改动";
    case "rejected":
      return "远端拒绝了本次操作（可能是权限或凭证问题）";
    case "conflict":
      return "存在冲突或本地改动会被覆盖，请在终端处理";
    default:
      return fallbackError;
  }
}

/** 暂存。 */
export async function gitStage(cwd: string, paths: unknown): Promise<GitMutationResult> {
  const rel = sanitizeGitPaths(paths);
  if (!rel) return failMutation("error", "暂存失败：路径列表为空或包含越界路径");
  return toMutation(await runGit(cwd, ["add", "--", ...rel]), "暂存失败");
}

/** 取消暂存（`git restore --staged` 更易读，等价于旧版 reset）。 */
export async function gitUnstage(cwd: string, paths: unknown): Promise<GitMutationResult> {
  const rel = sanitizeGitPaths(paths);
  if (!rel) return failMutation("error", "取消暂存失败：路径列表为空或包含越界路径");
  return toMutation(await runGit(cwd, ["restore", "--staged", "--", ...rel]), "取消暂存失败");
}

/** 放弃工作区改动（`git checkout -- <paths>`，不可恢复）。 */
export async function gitDiscard(cwd: string, paths: unknown): Promise<GitMutationResult> {
  const rel = sanitizeGitPaths(paths);
  if (!rel) return failMutation("error", "放弃更改失败：路径列表为空或包含越界路径");
  return toMutation(await runGit(cwd, ["checkout", "--", ...rel]), "放弃更改失败");
}

/** 提交：`all` 走 `-a`，`amend` 走 `--amend`。 */
export async function gitCommit(cwd: string, input: GitCommitInput): Promise<GitCommitResult> {
  const message = (input.message ?? "").trim();
  if (!message) return { ...failMutation("error", "请填写提交说明") };
  const args = ["commit", "-m", message];
  if (input.all) args.push("-a");
  if (input.amend) args.push("--amend");
  const res = await runGit(cwd, args);
  if (!res.ok) return toMutation(res, "提交失败");
  const short = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    ...okMutation(),
    ...(short.ok ? { commit: short.stdout.trim() } : {}),
    ...(branch.ok ? { branch: branch.stdout.trim() } : {}),
  };
}

/** 切分支；给了 paths 则只还原这些路径。 */
export async function gitCheckout(
  cwd: string,
  input: {
    ref?: string;
    paths?: string[];
  },
): Promise<GitMutationResult> {
  if (input.paths?.length) {
    const rel = sanitizeGitPaths(input.paths);
    if (!rel) return failMutation("error", "还原失败：路径列表为空或包含越界路径");
    return toMutation(await runGit(cwd, ["checkout", "--", ...rel]), "还原文件失败");
  }
  const ref = (input.ref ?? "").trim();
  if (!ref) return failMutation("error", "请指定要切换的分支");
  if (/^-/.test(ref)) return failMutation("error", "分支名非法");
  return toMutation(await runGit(cwd, ["checkout", ref]), `切换到分支 ${ref} 失败`);
}

/** 分支列表（含上游与 ahead/behind）。 */
export async function gitBranchList(cwd: string): Promise<{
  ok: boolean;
  branches: GitBranch[];
  error?: string;
}> {
  const res = await runGit(cwd, [
    "branch",
    "--format=%(refname:short)\t%(upstream:short)\t%(HEAD)",
  ]);
  if (!res.ok) {
    const failure = toMutation(res, "读取分支失败");
    return { ok: false, branches: [], error: failure.error };
  }
  const branches: GitBranch[] = [];
  for (const line of res.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, upstreamToken, headToken] = trimmed.split("\t");
    if (!name) continue;
    const current = (headToken ?? "").trim() === "*";
    const upstream = upstreamToken?.trim() ? upstreamToken.trim() : null;
    branches.push({ name, current, upstream, ahead: 0, behind: 0 });
  }
  await fillAheadBehind(cwd, branches);
  return { ok: true, branches };
}

/** 补齐每个分支相对上游的领先 / 落后数（逐一忽略失败，避免整块失败）。 */
async function fillAheadBehind(cwd: string, branches: GitBranch[]): Promise<void> {
  for (const branch of branches) {
    if (!branch.upstream) continue;
    const res = await runGit(cwd, [
      "rev-list",
      "--left-right",
      "--count",
      `${branch.upstream}...${branch.name}`,
    ]);
    if (!res.ok) continue;
    const [behindRaw, aheadRaw] = res.stdout.trim().split(/\s+/);
    branch.behind = Number.parseInt(behindRaw ?? "", 10) || 0;
    branch.ahead = Number.parseInt(aheadRaw ?? "", 10) || 0;
  }
}

/** 推送。 */
export async function gitPush(cwd: string, input: GitPushInput): Promise<GitMutationResult> {
  if (!input.remote && input.branch) {
    return failMutation("error", "推送失败：指定分支时必须同时指定远端");
  }
  const args = ["push"];
  if (input.setUpstream) args.push("-u");
  if (input.remote) args.push(input.remote);
  if (input.branch) args.push(input.branch);
  // 远端操作不做凭证代管：失败时由 toMutation 透出 Git 原文引导用户在终端处理
  return toMutation(await runGit(cwd, args, REMOTE_TIMEOUT_MS), "推送失败");
}

/** 拉取。 */
export async function gitPull(cwd: string, input: GitPullInput): Promise<GitMutationResult> {
  const args = ["pull"];
  if (input.rebase) args.push("--rebase");
  if (input.remote) args.push(input.remote);
  if (input.branch) args.push(input.branch);
  return toMutation(await runGit(cwd, args, REMOTE_TIMEOUT_MS), "拉取失败");
}

/** stash 保存。 */
export async function gitStashPush(cwd: string, input: GitStashInput): Promise<GitStashResult> {
  const args = ["stash", "push"];
  if (input.includeUntracked) args.push("-u");
  if (input.message?.trim()) args.push("-m", input.message.trim());
  const res = await runGit(cwd, args);
  if (!res.ok) return toMutation(res, "暂存更改失败");
  const list = await gitStashList(cwd);
  return { ...okMutation(), entries: list };
}

/** stash 弹出。 */
export async function gitStashPop(cwd: string, input: GitStashInput): Promise<GitMutationResult> {
  const args = ["stash", "pop"];
  if (Number.isFinite(input.index) && (input.index ?? 0) >= 0) {
    args.push(`stash@{${Math.floor(input.index ?? 0)}}`);
  }
  return toMutation(await runGit(cwd, args), "恢复暂存更改失败");
}

/** stash 列表解析（纯函数，便于测试）：`stash@{0}: On <branch>: <message>`。 */
export function parseStashList(stdout: string): GitStashEntry[] {
  const entries: GitStashEntry[] = [];
  for (const line of (stdout ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^stash@\{(\d+)\}:\s*(?:On\s+([^:]+):)?\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    entries.push({
      index: Number.parseInt(match[1] ?? "0", 10) || 0,
      branch: (match[2] ?? "").trim(),
      message: (match[3] ?? "").trim(),
    });
  }
  return entries;
}

/** 读取 stash 列表。 */
export async function gitStashList(cwd: string): Promise<GitStashEntry[]> {
  const res = await runGit(cwd, ["stash", "list"]);
  if (!res.ok) return [];
  return parseStashList(res.stdout);
}
