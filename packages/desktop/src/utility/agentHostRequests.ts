/**
 * utilityProcess → 主进程的宿主请求处理（PTY 命令行、内置浏览器）。
 *
 * 原先是 `AgentBridge` 里的两个私有方法；抽出来后只依赖「一个 send 回调 + 宿主单例」，
 * 便于单独阅读与测试，也让 `AgentBridge` 只剩「传输与 run 派发」两类职责。
 */
import type {
  GitResultPhase,
  GitStatus,
  UtilityBrowserRequest,
  UtilityGitRequest,
  UtilityPtyRequest,
  UtilityToChild,
} from "@thinker-workbench/shared";
import { releaseBrowserLease, tryAcquireBrowserLease } from "../agent/resourceGovernor";
import { browserSessionManager } from "../browser/BrowserSessionManager";
import { getGeneralSettings } from "../config/settingsStore";
import { getSessionByThreadId, getWorkspace } from "../db/workspacesStore";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";
import { getGitFileDiff, getGitStatus } from "../workspace/git";
import { sanitizeGitPaths } from "../workspace/gitWrite";

/** 命令会话，覆盖 exec / await / write / kill 四种动作。 */
export async function handlePtyRequest(
  send: (message: UtilityToChild) => void,
  req: UtilityPtyRequest,
): Promise<void> {
  const reply = (
    phase: "data" | "exit" | "result" | "error",
    extra: Partial<{
      sessionId: string;
      data: string;
      exitCode: number | null;
      backgrounded: boolean;
      outcome: "complete" | "still_running";
      wakeReason: "exit" | "timeout" | "pattern" | "background";
      output: string;
      outputPath: string;
      outputBytes: number;
      outputTruncated: boolean;
      execMode: "login" | "direct";
      error: string;
    }> = {},
  ) => {
    try {
      send({
        channel: "utility",
        kind: "ptyEvent",
        requestId: req.requestId,
        phase,
        ...extra,
      });
    } catch {
      /* child gone */
    }
  };

  const replyWaitResult = (result: {
    sessionId: string;
    output: string;
    exitCode: number | null;
    backgrounded: boolean;
    outcome: "complete" | "still_running";
    wakeReason?: "exit" | "timeout" | "pattern" | "background";
    outputPath?: string;
    outputBytes?: number;
    outputTruncated?: boolean;
    execMode?: "login" | "direct";
  }) => {
    reply("result", {
      sessionId: result.sessionId,
      output: result.output,
      exitCode: result.exitCode,
      backgrounded: result.backgrounded,
      outcome: result.outcome,
      wakeReason: result.wakeReason,
      outputPath: result.outputPath,
      outputBytes: result.outputBytes,
      outputTruncated: result.outputTruncated,
      execMode: result.execMode,
    });
  };

  try {
    if (req.action === "exec") {
      if (!req.command?.trim()) {
        reply("error", { error: "Missing command." });
        return;
      }
      const execMode = req.execMode === "direct" ? "direct" : "login";
      let sessionId = "";
      const started = await terminalSessionManager.startAgentCommand({
        command: req.command,
        cwd: req.workingDirectory,
        cols: req.cols,
        rows: req.rows,
        runId: req.runId,
        threadId: req.threadId,
        execMode,
        onSession: (id) => {
          sessionId = id;
        },
        onData: (data) => reply("data", { sessionId, data }),
      });
      sessionId = started.sessionId || sessionId;

      const shouldAwait = req.await !== false;
      const budgetMs = req.blockUntilMs ?? 30_000;
      // await:false 或 budget<=0：立刻 still_running，不弃跟踪
      if (!shouldAwait || budgetMs <= 0) {
        const result = await terminalSessionManager.waitAgentCommand(sessionId, {
          budgetMs: 0,
          onData: (data) => reply("data", { sessionId, data }),
        });
        replyWaitResult(result);
        return;
      }

      const waited = await terminalSessionManager.waitAgentCommand(sessionId, {
        budgetMs,
        onData: (data) => reply("data", { sessionId, data }),
      });
      if (waited.outcome === "complete") {
        terminalSessionManager.finishAwait(sessionId, waited);
      }
      replyWaitResult(waited);
      return;
    }

    if (req.action === "await") {
      if (!req.sessionId?.trim()) {
        reply("error", { error: "Missing sessionId." });
        return;
      }
      const result = terminalSessionManager.finishAwait(
        req.sessionId,
        await terminalSessionManager.waitAgentCommand(req.sessionId, {
          budgetMs: req.blockUntilMs ?? 30_000,
          pattern: req.pattern,
          requestId: req.requestId,
          onData: (data) => reply("data", { sessionId: req.sessionId, data }),
        }),
      );
      replyWaitResult(result);
      return;
    }

    if (req.action === "write") {
      if (!req.sessionId?.trim() || typeof req.data !== "string") {
        reply("error", { error: "Missing sessionId or data." });
        return;
      }
      if (!terminalSessionManager.canWrite(req.sessionId)) {
        reply("error", {
          error: "Session not writable (need running login agent session).",
        });
        return;
      }
      terminalSessionManager.write(req.sessionId, req.data);
      reply("result", {
        sessionId: req.sessionId,
        output: "",
        outcome: "complete",
        wakeReason: "exit",
        backgrounded: false,
      });
      return;
    }

    if (req.action === "kill") {
      if (!req.sessionId?.trim()) {
        reply("error", { error: "Missing sessionId." });
        return;
      }
      terminalSessionManager.kill(req.sessionId);
      reply("result", { sessionId: req.sessionId, output: "" });
      return;
    }

    reply("error", { error: `Unknown pty action: ${req.action}` });
  } catch (err) {
    reply("error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 浏览器自动化请求：先按 runId 抢浏览器租约（同一时刻只服务一个 run），
 * 结束后无论成败都释放。
 */
export async function handleGitRequest(
  send: (message: UtilityToChild) => void,
  req: UtilityGitRequest,
): Promise<void> {
  const reply = (
    phase: GitResultPhase,
    extra: Partial<{ output: string; error: string; truncated: boolean }> = {},
  ) => {
    try {
      send({
        channel: "utility",
        kind: "gitResult",
        requestId: req.requestId,
        phase,
        ...extra,
      });
    } catch {
      /* child gone */
    }
  };

  try {
    if (!getGeneralSettings().allowAiGit) {
      reply("error", {
        error:
          "AI git tools are disabled in Settings. Turn on “Allow AI to inspect git” to enable read-only git inspection.",
      });
      return;
    }
    const cwd = resolveRequestCwd(req);
    if (!cwd) {
      reply("error", { error: "Workspace not found for git request." });
      return;
    }
    const maxChars = clampMaxChars(req.maxChars);
    const paths = sanitizeGitPaths(req.paths) ?? [];

    if (req.action === "status") {
      const status = await getGitStatus(cwd);
      reply("result", truncateGitOutput(formatGitStatus(status), maxChars));
      return;
    }

    const targets = paths.length > 0 ? paths : undefined;
    const diffs: string[] = [];
    for (const target of targets ?? []) {
      const diff = await getGitFileDiff(cwd, target, req.contextLines ?? 3);
      if (diff.patch.trim()) diffs.push(diff.patch);
    }
    if (!targets) {
      const status = await getGitStatus(cwd);
      for (const file of status.files.slice(0, MAX_DIFF_FILES)) {
        const diff = await getGitFileDiff(cwd, file.path, req.contextLines ?? 3);
        if (diff.patch.trim()) diffs.push(diff.patch);
      }
    }
    if (diffs.length === 0) {
      reply("result", { output: "No changes detected in the working tree." });
      return;
    }
    const joined = diffs.join("\n");
    reply("result", {
      output: truncateGitOutput(joined, maxChars).output,
      truncated: joined.length > maxChars,
    });
  } catch (err) {
    reply("error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 解析宿主 Git 请求的工作目录：优先用显式 workspaceId，否则按 threadId 反查会话。
 * 解析不到返回空串，由调用方统一回 error（不抛异常到子进程）。
 */
function resolveRequestCwd(req: UtilityGitRequest): string {
  const workspaceId = req.workspaceId?.trim();
  if (workspaceId) return getWorkspace(workspaceId)?.rootPath ?? "";
  const threadId = req.threadId?.trim();
  if (!threadId) return "";
  const session = getSessionByThreadId(threadId);
  if (!session) return "";
  return getWorkspace(session.workspaceId)?.rootPath ?? "";
}

/** 单次 diff 请求最多带多少个文件（防止一次性塞爆上下文）。 */
const MAX_DIFF_FILES = 20;

/** 输出上限归一：非法值走默认 8000 字符，硬上限 40000。 */
function clampMaxChars(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 8000;
  return Math.min(40_000, Math.floor(n));
}

/** 截断过长的输出并打标。 */
function truncateGitOutput(text: string, maxChars: number): { output: string; truncated: boolean } {
  if (text.length <= maxChars) return { output: text, truncated: false };
  return {
    output: `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`,
    truncated: true,
  };
}

/** Git 状态失败原因 → 给模型看的英文短语（与 UI 文案同源的分类，不回传 stderr）。 */
const GIT_REASON_TEXT: Partial<Record<GitStatus["reason"], string>> = {
  not_a_repo: "not a git repository",
  git_not_found: "git not installed",
  cwd_missing: "workspace folder missing",
  timeout: "git timed out",
  git_error: "git unavailable",
};

/** 把 GitStatus 压成模型友好的文本（含分支、ahead/behind、变更文件与增删行数）。 */
export function formatGitStatus(status: GitStatus): string {
  if (!status.isRepo) {
    return `Repository status unavailable: ${GIT_REASON_TEXT[status.reason] ?? "git unavailable"}`;
  }
  const lines: string[] = [];
  lines.push(
    `Branch: ${status.branch ?? "(detached)"}${status.isDefaultBranch ? " (default)" : ""}`,
  );
  lines.push(`Ahead/behind upstream: +${status.ahead} / -${status.behind}`);
  lines.push(
    `Changed files: ${status.files.length} (+${status.totals.added} / -${status.totals.removed})`,
  );
  for (const file of status.files.slice(0, 200)) {
    lines.push(`  ${file.status.padEnd(10)} ${file.path} (+${file.added}/-${file.removed})`);
  }
  if (status.files.length === 0) {
    lines.push("  (working tree clean)");
  }
  return lines.join("\n");
}

/** 内置浏览器自动化请求：`goto` / `act` / `extract` / `screenshot` / `console` / `close`。 */
export async function handleBrowserRequest(
  send: (message: UtilityToChild) => void,
  req: UtilityBrowserRequest,
): Promise<void> {
  const reply = (
    phase: "result" | "error",
    extra: Partial<{ output: string; error: string; screenshotPath: string }> = {},
  ) => {
    try {
      send({
        channel: "utility",
        kind: "browserEvent",
        requestId: req.requestId,
        phase,
        ...extra,
      });
    } catch {
      /* child gone */
    }
  };

  const runId = req.runId?.trim() ?? "";
  if (runId && !tryAcquireBrowserLease(runId)) {
    reply("error", {
      error: "Browser is busy with another session. Wait or stop the other run.",
    });
    return;
  }

  try {
    if (!getGeneralSettings().allowAiBrowser) {
      reply("error", {
        error:
          "Browser tools are disabled in Settings (Browser protection). Ask the user to turn protection off if browser automation is required.",
      });
      return;
    }
    const result = await browserSessionManager.handleRequest(req);
    reply("result", {
      output: result.output,
      screenshotPath: result.screenshotPath,
    });
  } catch (err) {
    reply("error", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (runId) releaseBrowserLease(runId);
  }
}
