/**
 * 工作空间 Git：status / 单文件 diff / init（移植自 thinker-workbench-v1）。
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitChangedFile, GitFileDiff, GitStatus, GitStatusReason } from "@thinker-workbench/shared";

const execFileAsync = promisify(execFile);

type GitResult =
  | { ok: true; stdout: string }
  | { ok: false; code: number; stderr: string; notFound: boolean };

function looksLikeGitMissing(err: unknown, stderr: string): boolean {
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === "ENOENT") return true;
  const msg = `${stderr} ${String(err)}`.toLowerCase();
  return (
    msg.includes("enoent") ||
    msg.includes("not recognized") ||
    msg.includes("not found") ||
    msg.includes("cannot find") ||
    msg.includes("no such file")
  );
}

async function git(cwd: string, args: string[], timeoutMs = 20_000): Promise<GitResult> {
  try {
    const { stdout } = await execFileAsync("git", args, {
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
    };
    const stderr = String(e.stderr ?? e.stdout ?? err);
    const notFound = looksLikeGitMissing(err, stderr);
    if (e.killed || /TIMEDOUT|timeout/i.test(stderr) || e.code === "ETIMEDOUT") {
      return { ok: false, code: 124, stderr: stderr || "git timed out", notFound: false };
    }
    return {
      ok: false,
      code: typeof e.code === "number" ? e.code : notFound ? 127 : 1,
      stderr,
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
    map.set(filePath.replace(/\\/g, "/"), { added, removed });
  }
  return map;
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

function emptyStatus(reason: GitStatusReason, gitAvailable: boolean): GitStatus {
  return {
    isRepo: false,
    gitAvailable,
    reason,
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
    if (rev.notFound) return emptyStatus("git_not_found", false);
    if (/not a git repository/i.test(rev.stderr)) return emptyStatus("not_a_repo", true);
    return emptyStatus("git_error", true);
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
    const [b, a] = ab.stdout.trim().split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
    behind = b ?? 0;
    ahead = a ?? 0;
  }

  const porcelain = await git(cwd, ["status", "--porcelain=1", "-uall"], 30_000);
  if (!porcelain.ok && porcelain.code === 124) {
    return emptyStatus("git_error", true);
  }
  const files: GitChangedFile[] = [];
  if (porcelain.ok) {
    const rawLines = porcelain.stdout.split(/\r?\n/).filter((line) => line.length >= 3);
    const stats = new Map<string, { added: number; removed: number }>();
    if (rawLines.length <= 400) {
      const numstat = await git(cwd, ["diff", "--numstat", "HEAD"], 25_000);
      const unstaged = await git(cwd, ["diff", "--numstat"], 25_000);
      if (numstat.ok) {
        for (const [p, s] of parseNumstat(numstat.stdout)) stats.set(p, s);
      }
      if (unstaged.ok) {
        for (const [p, s] of parseNumstat(unstaged.stdout)) {
          const prev = stats.get(p) ?? { added: 0, removed: 0 };
          stats.set(p, { added: prev.added + s.added, removed: prev.removed + s.removed });
        }
      }
    }

    for (const line of rawLines) {
      const xy = line.slice(0, 2);
      let filePath = line.slice(3);
      if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop() ?? filePath;
      filePath = filePath.replace(/\\/g, "/");
      const s = stats.get(filePath) ?? { added: 0, removed: 0 };
      files.push({
        path: filePath,
        status: statusLabel(xy),
        added: s.added,
        removed: s.removed,
      });
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
