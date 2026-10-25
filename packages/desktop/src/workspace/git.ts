/**
 * 工作空间 Git：status / 单文件 diff / init（移植自 thinker-workbench-v1）。
 *
 * GUI 进程继承的 PATH 可能比终端更旧（Git 刚装好、Explorer 还没重启），
 * 所以先自己定位 git 可执行文件、PATH 未命中时再探常见安装目录，
 * 避免把「PATH 里没有」误报成「没装 Git」；定位失败仍用裸 `git` 兜底一次。
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  GitChangedFile,
  GitFileDiff,
  GitStatus,
  GitStatusReason,
} from "@thinker-workbench/shared";
import { desktopLog } from "../log/setup";
import { augmentPathEnv } from "../terminal/shellEnv";

const execFileAsync = promisify(execFile);
const gitLog = desktopLog("git");

type GitResult =
  | { ok: true; stdout: string }
  | { ok: false; code: number; stderr: string; notFound: boolean };

/** 执行结果类型：写操作模块需要它来构造回执。 */
export type GitExecResult = GitResult;

/** 路径存在且为文件。 */
function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 路径存在且为目录。 */
function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 在 PATH 中按 PATHEXT 找可执行文件（Windows 的 spawn 只自动补 .exe）。 */
function findOnPath(name: string): string | null {
  const pathEnv = augmentPathEnv(process.env.PATH ?? process.env.Path ?? "");
  const sep = process.platform === "win32" ? ";" : ":";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const rawDir of pathEnv.split(sep)) {
    // PATH 里偶有带引号的目录项
    const dir = rawDir.trim().replace(/^"|"$/g, "");
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + (process.platform === "win32" ? ext : ""));
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Windows 常见安装位置：PATH 尚未刷新时的兜底候选。 */
function windowsGitCandidates(): string[] {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const roots = [
    path.join(programFiles, "Git"),
    path.join(programFilesX86, "Git"),
    path.join(localAppData, "Programs", "Git"),
  ];
  return roots.flatMap((root) => [
    path.join(root, "cmd", "git.exe"),
    path.join(root, "bin", "git.exe"),
  ]);
}

/** 只缓存命中的结果：装好 Git 后点「刷新」即可生效，不必重启应用。 */
let cachedGitBinary: string | undefined;
/** 找不到 git 的告警只打一次，避免轮询刷屏。 */
let warnedMissing = false;

/**
 * 定位 git 可执行文件；找不到返回 null。
 * 返回 null 时调用方仍会用裸 `git` 试一次，最终由 spawn 的 ENOENT 定论。
 */
export function resolveGitBinary(): string | null {
  if (cachedGitBinary) return cachedGitBinary;
  const onPath = findOnPath("git");
  if (onPath) {
    cachedGitBinary = onPath;
    return onPath;
  }
  if (process.platform === "win32") {
    for (const candidate of windowsGitCandidates()) {
      if (isFile(candidate)) {
        gitLog.warn("git 不在 PATH 中，改用已知安装位置", { binary: candidate });
        cachedGitBinary = candidate;
        return candidate;
      }
    }
  }
  if (!warnedMissing) {
    gitLog.warn("PATH 中找不到 git", { path: process.env.PATH ?? process.env.Path ?? "" });
    warnedMissing = true;
  }
  return null;
}

/** 仅测试用：清空可执行文件缓存。 */
export function resetGitBinaryCacheForTests(): void {
  cachedGitBinary = undefined;
  warnedMissing = false;
}

/** 供写操作模块（`gitWrite.ts`）复用的执行出口。 */
export async function runGit(cwd: string, args: string[], timeoutMs?: number): Promise<GitResult> {
  return timeoutMs === undefined ? git(cwd, args) : git(cwd, args, timeoutMs);
}

async function git(cwd: string, args: string[], timeoutMs = 20_000): Promise<GitResult> {
  const binary = resolveGitBinary() ?? "git";
  try {
    const { stdout } = await execFileAsync(binary, args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
    });
    return { ok: true, stdout: stdout.toString() };
  } catch (err) {
    const e = err as {
      code?: number | string;
      killed?: boolean;
      stderr?: Buffer | string;
      stdout?: Buffer | string;
      message?: string;
    };
    const stderr = String(e.stderr ?? e.stdout ?? e.message ?? err);
    if (e.killed || /TIMEDOUT|timeout/i.test(stderr) || e.code === "ETIMEDOUT") {
      return { ok: false, code: 124, stderr: stderr || "git timed out", notFound: false };
    }
    // ENOENT 还可能来自 cwd 不存在（工作空间目录被移走/删除），不能一律算「没装 Git」
    const cwdMissing = !isDirectory(cwd);
    const notFound = e.code === "ENOENT" && !cwdMissing;
    // 非仓库 / 无 upstream 等是常态失败，只在真异常时留痕，避免轮询刷日志
    if (notFound || cwdMissing) {
      gitLog.warn("git 调用失败", {
        binary,
        cwd,
        args: args.join(" "),
        code: e.code,
        cwdMissing,
        stderr: stderr.slice(0, 500),
      });
    }
    return {
      ok: false,
      code: typeof e.code === "number" ? e.code : notFound ? 127 : 1,
      stderr: cwdMissing ? `工作空间目录不存在：${cwd}` : stderr,
      notFound,
    };
  }
}

function parseNumstat(stdout: string): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [a, r, ...pathParts] = parts;
    const filePath = pathParts.join("\t");
    if (!filePath) continue;
    const added = a === "-" ? 0 : Number.parseInt(a, 10) || 0;
    const removed = r === "-" ? 0 : Number.parseInt(r, 10) || 0;
    // numstat 同样会对非 ASCII 路径加引号，不解开就跟 status 的路径对不上
    map.set(unquoteGitPath(filePath).replace(/\\/g, "/"), { added, removed });
  }
  return map;
}

/** 未跟踪文件不在 numstat 里，超过这个大小就不数了（大概率是产物/二进制）。 */
const UNTRACKED_COUNT_MAX_BYTES = 512 * 1024;
/** 一次最多数多少个未跟踪文件：几百个新文件时别把状态刷新拖慢。 */
const UNTRACKED_COUNT_MAX_FILES = 300;

/**
 * 未跟踪文件的「新增行数」= 文件行数。
 *
 * git 的 numstat 只统计已跟踪的改动，`??` 文件拿不到任何数字，
 * 于是列表里新文件只能显示一个 Untracked 标签、头部总计也偏小。
 * 二进制（含 NUL 字节）与超大文件返回 null，交给调用方保持 0。
 */
async function countUntrackedLines(absPath: string): Promise<number | null> {
  try {
    const stat = await fs.promises.stat(absPath);
    if (!stat.isFile() || stat.size > UNTRACKED_COUNT_MAX_BYTES) return null;
    const buf = await readFile(absPath);
    if (buf.includes(0)) return null;
    if (buf.length === 0) return 0;
    let lines = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) lines++;
    }
    // 末尾没有换行时最后一行也要算
    return buf[buf.length - 1] === 0x0a ? lines : lines + 1;
  } catch {
    return null;
  }
}

/**
 * 还原 porcelain 的 C 风格引用路径。
 *
 * 非 ASCII（中文文件名）默认会被 git 包成 `"\344\270\255\346\226\207.md"`，
 * 既让列表里显示成一串八进制，也让「未跟踪文件数行数」按这个假路径 stat 失败、
 * 于是新文件永远没有 +N。这里把引用解开还原成真正的 UTF-8 路径。
 */
function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] ?? "";
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = body[i + 1] ?? "";
    if (next >= "0" && next <= "7") {
      bytes.push(Number.parseInt(body.slice(i + 1, i + 4), 8) & 0xff);
      i += 3;
      continue;
    }
    i += 1;
    const escaped: Record<string, number> = {
      a: 0x07,
      b: 0x08,
      f: 0x0c,
      n: 0x0a,
      r: 0x0d,
      t: 0x09,
      v: 0x0b,
    };
    const code = escaped[next];
    if (code !== undefined) bytes.push(code);
    else bytes.push(...Buffer.from(next, "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

function statusLabel(xy: string): string {
  const x = xy[0] ?? " ";
  const y = xy[1] ?? " ";
  if (x === "?" && y === "?") return "untracked";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "R" || y === "R") return "renamed";
  if (x === "M" || y === "M") return "modified";
  if (x === "U" || y === "U") return "conflict";
  return "modified";
}

/** 冲突优先，其次改动量降序，再按路径。 */
function compareChangedPath(a: GitChangedFile, b: GitChangedFile): number {
  const rank = (s: string) => (s === "conflict" ? 0 : 1);
  const byStatus = rank(a.status) - rank(b.status);
  if (byStatus !== 0) return byStatus;
  const byChurn = b.added + b.removed - (a.added + a.removed);
  if (byChurn !== 0) return byChurn;
  return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
}

/** 诊断细节：截断过长的 stderr，避免整段命令输出塞进 UI。 */
function diagnosticDetail(raw: string | undefined): string | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

function emptyStatus(reason: GitStatusReason, gitAvailable: boolean, detail?: string): GitStatus {
  return {
    isRepo: false,
    gitAvailable,
    reason,
    detail: diagnosticDetail(detail),
    branch: null,
    isDefaultBranch: false,
    ahead: 0,
    behind: 0,
    files: [],
    totals: { added: 0, removed: 0 },
  };
}

/** 工作区 Git 状态。 */
export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const rev = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!rev.ok) {
    if (rev.notFound) return emptyStatus("git_not_found", false, rev.stderr);
    if (/not a git repository/i.test(rev.stderr)) return emptyStatus("not_a_repo", true);
    return emptyStatus("git_error", true, rev.stderr);
  }
  if (rev.stdout.trim() !== "true") return emptyStatus("not_a_repo", true);

  const branchRes = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.ok ? branchRes.stdout.trim() || null : null;

  let isDefaultBranch = false;
  const sym = await git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (sym.ok) {
    const def = sym.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
    isDefaultBranch = Boolean(branch && def && branch === def);
  } else if (branch === "main" || branch === "master") {
    isDefaultBranch = true;
  }

  let ahead = 0;
  let behind = 0;
  const ab = await git(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
  if (ab.ok) {
    const [b, a] = ab.stdout
      .trim()
      .split(/\s+/)
      .map((n) => Number.parseInt(n, 10) || 0);
    behind = b ?? 0;
    ahead = a ?? 0;
  }

  const porcelain = await git(cwd, ["status", "--porcelain=1", "-uall"], 30_000);
  if (!porcelain.ok && porcelain.code === 124) {
    return emptyStatus("git_error", true, porcelain.stderr);
  }
  const files: GitChangedFile[] = [];
  if (porcelain.ok) {
    const rawLines = porcelain.stdout.split(/\r?\n/).filter((line) => line.length >= 3);
    const stats = new Map<string, { added: number; removed: number }>();
    // 不再按文件数截断：曾经 >400 个文件就整块跳过行数，
    // 结果大改动时列表只剩状态标签、头部也拿不到 +N −M。numstat 只是一次子进程。
    //
    // `diff HEAD` 已经是「工作区 vs HEAD」（暂存 + 未暂存都在内），
    // 再叠加一次 `diff`（工作区 vs 暂存）会把未暂存的改动算两遍。
    const numstat = await git(cwd, ["diff", "--numstat", "HEAD"], 25_000);
    if (numstat.ok) {
      for (const [p, s] of parseNumstat(numstat.stdout)) stats.set(p, s);
    } else {
      // 还没有 HEAD（刚 init 的空仓库）：暂存区里的就是全部新增
      const cached = await git(cwd, ["diff", "--numstat", "--cached"], 25_000);
      if (cached.ok) {
        for (const [p, s] of parseNumstat(cached.stdout)) stats.set(p, s);
      }
    }

    const untracked: string[] = [];
    for (const line of rawLines) {
      const xy = line.slice(0, 2);
      let filePath = line.slice(3);
      if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop() ?? filePath;
      filePath = unquoteGitPath(filePath).replace(/\\/g, "/");
      const s = stats.get(filePath) ?? { added: 0, removed: 0 };
      files.push({
        path: filePath,
        status: statusLabel(xy),
        added: s.added,
        removed: s.removed,
      });
      if (xy === "??" && s.added === 0 && s.removed === 0) untracked.push(filePath);
    }

    // 未跟踪文件按行数补上「新增」：否则新文件永远只有标签、没有 +N
    if (untracked.length > 0 && untracked.length <= UNTRACKED_COUNT_MAX_FILES) {
      const counts = await Promise.all(
        untracked.map((p) => countUntrackedLines(path.join(cwd, p))),
      );
      const byPath = new Map(files.map((f) => [f.path, f]));
      for (let i = 0; i < untracked.length; i++) {
        const added = counts[i];
        if (added == null || added === 0) continue;
        const file = byPath.get(untracked[i] ?? "");
        if (file) file.added = added;
      }
    }
    files.sort(compareChangedPath);
  }

  const totals = files.reduce(
    (acc, f) => ({ added: acc.added + f.added, removed: acc.removed + f.removed }),
    { added: 0, removed: 0 },
  );

  return {
    isRepo: true,
    gitAvailable: true,
    reason: "ok",
    branch,
    isDefaultBranch,
    ahead,
    behind,
    files,
    totals,
  };
}

/** `git init`。 */
export async function gitInit(cwd: string): Promise<{ ok: boolean; error?: string }> {
  const res = await git(cwd, ["init"]);
  if (!res.ok) {
    return { ok: false, error: res.stderr.trim() || "git init failed" };
  }
  return { ok: true };
}

/** 单文件 unified diff。 */
export async function getGitFileDiff(
  cwd: string,
  filePath: string,
  contextLines = 3,
): Promise<GitFileDiff> {
  const rel = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const ctx = Number.isFinite(contextLines) ? Math.max(0, Math.floor(contextLines)) : 3;
  const u = `-U${ctx}`;

  const fromHead = await git(cwd, ["diff", "HEAD", u, "--", rel]);
  if (fromHead.ok && fromHead.stdout.trim()) {
    return {
      path: rel,
      patch: fromHead.stdout,
      binary: /Binary files .* differ/i.test(fromHead.stdout),
    };
  }

  const unstaged = await git(cwd, ["diff", u, "--", rel]);
  if (unstaged.ok && unstaged.stdout.trim()) {
    return {
      path: rel,
      patch: unstaged.stdout,
      binary: /Binary files .* differ/i.test(unstaged.stdout),
    };
  }

  try {
    const abs = path.join(cwd, rel);
    const buf = await readFile(abs);
    if (buf.includes(0)) {
      return { path: rel, patch: `Binary file ${rel} (new)\n`, binary: true };
    }
    const text = buf.toString("utf8");
    const lines = text.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const body = lines.map((line) => `+${line}`);
    const patch = [
      `diff --git a/${rel} b/${rel}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${rel}`,
      `@@ -0,0 +1,${Math.max(lines.length, 0)} @@`,
      ...body,
      "",
    ].join("\n");
    return { path: rel, patch, binary: false };
  } catch {
    return { path: rel, patch: "", binary: false };
  }
}
