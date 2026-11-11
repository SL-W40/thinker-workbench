/**
 * utilityProcess → 主进程的宿主请求处理（PTY 命令行、内置浏览器）。
 *
 * 原先是 `AgentBridge` 里的两个私有方法；抽出来后只依赖「一个 send 回调 + 宿主单例」，
 * 便于单独阅读与测试，也让 `AgentBridge` 只剩「传输与 run 派发」两类职责。
 */
import type {
  UtilityBrowserRequest,
  UtilityPtyRequest,
  UtilityToChild,
} from "@thinker-workbench/shared";
import { releaseBrowserLease, tryAcquireBrowserLease } from "../agent/resourceGovernor";
import { browserSessionManager } from "../browser/BrowserSessionManager";
import { getGeneralSettings } from "../config/settingsStore";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";

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
