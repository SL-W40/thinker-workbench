/**
 * 主进程与 Agent utilityProcess 之间的消息桥。
 *
 * 负责：attach 子进程、等待 ready、发送 run/cancel/hello、
 * 将 AgentEvent / LogRecord 分发给监听者，并在 done/error 时 resolve 对应 Promise。
 */
import { PREVIEW_BODY_CHARS, withTextPreview } from "@thinker-workbench/logger";
import {
  createId,
  createRunId,
  createThreadId,
  createTraceId,
  DEFAULT_CHAT_MODE,
  emptyContextUsageSnapshot,
  normalizeChatMode,
  type AgentEvent,
  type AgentResumeCommand,
  type AgentRunCommand,
  type ChatMode,
  type ContextUsageRequest,
  type ContextUsageSnapshot,
  type HitlResponse,
  type LogRecord,
  type ModelSelection,
  type RunResult,
  type UtilityBrowserRequest,
  type UtilityPtyRequest,
  type UtilityToChild,
} from "@thinker-workbench/shared";
import type { UtilityProcess } from "electron";
import { browserSessionManager } from "../browser/BrowserSessionManager";
import { getDataDir } from "../config/paths";
import {
  getGeneralSettings,
  getModelCatalog,
  resolvePrimaryModelSettings,
} from "../config/settingsStore";
import { listAgents } from "../customize/agentsStore";
import {
  getActiveSessionId,
  getSession,
  getSessionByThreadId,
  getSessionChatMode,
  getSessionModelSelection,
  setSessionRunStatus,
  upsertSessionForRun,
} from "../db/workspacesStore";
import { desktopLog } from "../log/setup";
import { broadcastThreadsChanged } from "../ipc/workspacesHandlers";
import { shellFactsForAgent } from "../terminal/detectShellProfiles";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";
import { endTraceSpan, startTraceSpan } from "../trace/writeSpan";
import { isUtilityToParent } from "./transfer";

/** 等待终态的进行中 run。 */
type PendingRun = {
  resolve: (result: RunResult) => void;
  threadId: string;
  runId: string;
  traceId: string;
};

/** 等待 contextUsage 结果。 */
type PendingContextUsage = {
  resolve: (usage: ContextUsageSnapshot) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** 主进程侧 Agent 通信门面。 */
export class AgentBridge {
  /** 当前绑定的 utilityProcess；退出后置 null。 */
  private child: UtilityProcess | null = null;
  /** 是否已收到子进程 `ready` 握手。 */
  private ready = false;
  /** 等待 ready 的 resolve 队列。 */
  private readyWaiters: Array<() => void> = [];
  /** runId → 待 resolve 的 Promise。 */
  private readonly pending = new Map<string, PendingRun>();
  /** AgentEvent 订阅者。 */
  private readonly eventListeners = new Set<(event: AgentEvent) => void>();
  /** LogRecord 订阅者（来自 agent utility）。 */
  private readonly logListeners = new Set<(record: LogRecord) => void>();
  /** requestId → contextUsage 等待者。 */
  private readonly pendingContextUsage = new Map<string, PendingContextUsage>();

  /**
   * 绑定新的子进程并监听 message。
   * 会重置 ready；处理 channel=utility 且 kind 为 ready/event/log 的消息。
   */
  attach(child: UtilityProcess): void {
    this.child = child;
    this.ready = false;

    child.on("message", (raw) => {
      if (!isUtilityToParent(raw)) return;
      if (raw.kind === "ready") {
        this.ready = true;
        for (const wake of this.readyWaiters) wake();
        this.readyWaiters = [];
        return;
      }
      if (raw.kind === "event") {
        this.onAgentEvent(raw.event);
        return;
      }
      if (raw.kind === "log") {
        for (const listener of this.logListeners) {
          listener(raw.record);
        }
        return;
      }
      if (raw.kind === "contextUsageResult") {
        const pending = this.pendingContextUsage.get(raw.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingContextUsage.delete(raw.requestId);
        pending.resolve(raw.usage);
        return;
      }
      if (raw.kind === "ptyRequest") {
        void this.handlePtyRequest(raw);
        return;
      }
      if (raw.kind === "browserRequest") {
        void this.handleBrowserRequest(raw);
        return;
      }
      if (raw.kind === "hitl") {
        // 转成 AgentEvent 推给 renderer / 通知；engine 仍 await hitlResult
        this.onAgentEvent({
          type: "hitl",
          phase: "request",
          hitlId: raw.request.hitlId,
          kind: raw.request.kind,
          threadId: raw.request.threadId,
          runId: raw.request.runId,
          ts: Date.now(),
          request: raw.request,
        });
        return;
      }
      if (raw.kind === "mcpStatus") {
        try {
          const { handleMcpStatusFromAgent } = require("../ipc/mcpHandlers") as typeof import("../ipc/mcpHandlers");
          handleMcpStatusFromAgent(raw.status);
        } catch {
          /* ignore */
        }
        return;
      }
      if (raw.kind === "span") {
        try {
          if (raw.phase === "start") {
            const s = raw.span;
            const attrs = s.attrs ?? {};
            startTraceSpan({
              spanId: s.spanId,
              sessionId: s.sessionId,
              runId: s.runId,
              traceId: s.traceId,
              parentSpanId: s.parentSpanId,
              taskId: s.taskId,
              name: s.name,
              kind: s.kind,
              source: s.source ?? "agent",
              summary: s.summary,
              attrs,
              input: s.input,
              startTs: s.startTs,
              workspaceId:
                typeof attrs.workspaceId === "string" ? attrs.workspaceId : undefined,
              threadId: typeof attrs.threadId === "string" ? attrs.threadId : undefined,
              title: typeof attrs.title === "string" ? attrs.title : undefined,
              bumpRun: s.name === "run",
            });
          } else {
            endTraceSpan(raw.spanId, {
              status: raw.status,
              summary: raw.summary,
              output: raw.output,
              error: raw.error,
              attrs: raw.attrs,
              endTs: raw.endTs,
            });
          }
        } catch {
          /* Trace 写入失败不拖垮 bridge */
        }
      }
    });
  }

  /** 将 HITL 答复发回 utility。 */
  sendHitlResult(response: HitlResponse): void {
    try {
      this.send({ channel: "utility", kind: "hitlResult", response });
    } catch (err) {
      desktopLog("bridge").warn("hitlResult send failed", {
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  /** 处理 utility 侧 PTY 请求。 */
  private async handlePtyRequest(req: UtilityPtyRequest): Promise<void> {
    const reply = (
      phase: "data" | "exit" | "result" | "error",
      extra: Partial<{
        sessionId: string;
        data: string;
        exitCode: number | null;
        backgrounded: boolean;
        output: string;
        error: string;
      }> = {},
    ) => {
      try {
        this.send({
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

    try {
      if (req.action === "exec") {
        if (!req.command?.trim()) {
          reply("error", { error: "Missing command." });
          return;
        }
        let sessionId = "";
        const result = await terminalSessionManager.exec({
          command: req.command,
          cwd: req.workingDirectory,
          blockUntilMs: req.blockUntilMs,
          cols: req.cols,
          rows: req.rows,
          runId: req.runId,
          threadId: req.threadId,
          onSession: (id) => {
            sessionId = id;
          },
          onData: (data) => reply("data", { sessionId, data }),
        });
        reply("result", {
          sessionId: result.sessionId,
          output: result.output,
          exitCode: result.exitCode,
          backgrounded: result.backgrounded,
        });
        return;
      }

      if (req.action === "await") {
        if (!req.sessionId?.trim()) {
          reply("error", { error: "Missing sessionId." });
          return;
        }
        const result = terminalSessionManager.finishAwait(
          req.sessionId,
          await terminalSessionManager.awaitSession(req.sessionId, {
            blockUntilMs: req.blockUntilMs ?? 30_000,
            pattern: req.pattern,
            requestId: req.requestId,
            onData: (data) => reply("data", { sessionId: req.sessionId, data }),
          }),
        );
        reply("result", {
          sessionId: result.sessionId,
          output: result.output,
          exitCode: result.exitCode,
          backgrounded: result.backgrounded,
        });
        return;
      }

      if (req.action === "write") {
        if (!req.sessionId?.trim() || typeof req.data !== "string") {
          reply("error", { error: "Missing sessionId or data." });
          return;
        }
        terminalSessionManager.write(req.sessionId, req.data);
        reply("result", { sessionId: req.sessionId, output: "" });
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

  /** 处理 utility 侧浏览器自动化请求。 */
  private async handleBrowserRequest(req: UtilityBrowserRequest): Promise<void> {
    const reply = (
      phase: "result" | "error",
      extra: Partial<{ output: string; error: string; screenshotPath: string }> = {},
    ) => {
      try {
        this.send({
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

    try {
      const result = await browserSessionManager.handleRequest(req);
      reply("result", {
        output: result.output,
        screenshotPath: result.screenshotPath,
      });
    } catch (err) {
      reply("error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 子进程退出时调用：清空 child/ready，并将所有 pending run 以错误结果 resolve。
   * @param code 退出码，可能为 null
   */
  markExited(code: number | null): void {
    this.ready = false;
    this.child = null;
    const error = `Agent utilityProcess exited (${code ?? "null"}).`;
    for (const [runId, pending] of this.pending) {
      desktopLog("bridge").error("child exit during run", {
        traceId: pending.traceId,
        runId,
        threadId: pending.threadId,
        meta: { code },
      });
      pending.resolve({
        ok: false,
        error,
        runId,
        threadId: pending.threadId,
      });
    }
    this.pending.clear();
    for (const [id, pending] of this.pendingContextUsage) {
      clearTimeout(pending.timer);
      pending.resolve(emptyContextUsageSnapshot());
      this.pendingContextUsage.delete(id);
    }
  }

  /**
   * 向 utility 请求上下文占用快照（与 assembleContext 同源）。
   * 超时或未就绪时返回空快照。
   */
  async getContextUsage(
    request: ContextUsageRequest = {},
    timeoutMs = 8_000,
  ): Promise<ContextUsageSnapshot> {
    try {
      await this.waitUntilReady(timeoutMs);
    } catch {
      return emptyContextUsageSnapshot();
    }
    const requestId = createId("ctx");
    const general = getGeneralSettings();
    return new Promise<ContextUsageSnapshot>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingContextUsage.delete(requestId);
        resolve(emptyContextUsageSnapshot());
      }, timeoutMs);
      this.pendingContextUsage.set(requestId, { resolve, timer });
      try {
        const activeId = getActiveSessionId();
        const activeSession = activeId ? getSession(activeId) : null;
        this.send({
          channel: "utility",
          kind: "contextUsage",
          requestId,
          request,
          ...this.modelPayload(activeSession?.threadId),
          model: resolvePrimaryModelSettings(),
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
          workspaceRoot: request.workspaceRoot,
          dataDir: getDataDir(),
        });
      } catch {
        clearTimeout(timer);
        this.pendingContextUsage.delete(requestId);
        resolve(emptyContextUsageSnapshot());
      }
    });
  }

  /**
   * 等待子进程 ready 握手。
   * @param timeoutMs 默认 15s，超时 reject
   */
  async waitUntilReady(timeoutMs = 15_000): Promise<void> {
    if (this.ready) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Agent utilityProcess ready timeout.")),
        timeoutMs,
      );
      this.readyWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * 向子进程 postMessage。
   * @throws 子进程未运行时抛错
   */
  send(message: UtilityToChild): void {
    if (!this.child) {
      throw new Error("Agent utilityProcess is not running.");
    }
    this.child.postMessage(message);
  }

  /**
   * 订阅 AgentEvent。
   * @returns 取消订阅函数
   */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * 订阅来自 agent 的 LogRecord。
   * @returns 取消订阅函数
   */
  onLog(listener: (record: LogRecord) => void): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  /**
   * 取消指定 run，或未传 runId 时取消全部 pending。
   */
  cancel(runId?: string): void {
    const targets = runId?.trim() ? [runId.trim()] : [...this.pending.keys()];
    for (const id of targets) {
      const pending = this.pending.get(id);
      desktopLog("bridge").info("cancel", {
        traceId: pending?.traceId,
        runId: id,
        threadId: pending?.threadId,
      });
      terminalSessionManager.killByRunId(id);
      this.send({
        channel: "utility",
        kind: "cancel",
        command: { runId: id },
      });
    }
  }

  /** hello / run / resume 共用的 shell 相关字段。 */
  private shellPayload() {
    const general = getGeneralSettings();
    return {
      allowAiShell: general.allowAiShell,
      allowAiBrowser: general.allowAiBrowser,
      shellApprovalMode: general.shellApprovalMode,
      shellAllowlist: general.shellAllowlist,
      shell: shellFactsForAgent(general.shellProfileId),
    };
  }

  /** 解析本轮模型目录与生效选用（会话覆盖优先于全局）。 */
  private modelPayload(threadId?: string): {
    catalog: ReturnType<typeof getModelCatalog>;
    selection: ModelSelection;
  } {
    const catalog = getModelCatalog();
    let selection = catalog.selection;
    if (threadId) {
      const session = getSessionByThreadId(threadId);
      if (session) {
        const override = getSessionModelSelection(session.id);
        if (override) selection = override;
      }
    }
    return { catalog, selection };
  }

  /** 解析本轮会话 ChatMode（缺省 agent）。 */
  private chatModePayload(threadId?: string): { chatMode: ChatMode } {
    let chatMode = DEFAULT_CHAT_MODE;
    if (threadId) {
      const session = getSessionByThreadId(threadId);
      if (session) {
        const stored = getSessionChatMode(session.id);
        if (stored) chatMode = normalizeChatMode(stored);
      }
    }
    return { chatMode };
  }

  /** 当前工作区可见的子代理定义快照。 */
  private subagentsPayload(workspaceRoot?: string | null) {
    return { subagents: listAgents(workspaceRoot).agents };
  }

  /**
   * 发起一次 run：等待 ready、分配 threadId/runId/traceId、发送 run 消息，
   * 直到收到对应 done/error 事件才 resolve。
   */
  async run(command: AgentRunCommand): Promise<RunResult> {
    await this.waitUntilReady();
    const threadId = command.threadId?.trim() || createThreadId();
    const runId = createRunId();
    const traceId = command.traceId?.trim() || createTraceId();
    const message = typeof command.message === "string" ? command.message : "";
    const log = desktopLog("bridge.run");

    let sessionId: string | undefined;
    let workspaceId: string | undefined;
    let sessionTitle: string | undefined;
    try {
      const existing = getSessionByThreadId(threadId);
      const session = upsertSessionForRun({
        threadId,
        workspaceId: existing?.workspaceId,
        titleHint: message,
        runStatus: "running",
        activeRunId: runId,
        interruptReason: null,
      });
      sessionId = session.id;
      workspaceId = session.workspaceId;
      sessionTitle = session.title;
      broadcastThreadsChanged();
    } catch {
      /* 无 workspace 时可能创建失败；仍继续 run */
    }

    return new Promise<RunResult>((resolve) => {
      this.pending.set(runId, {
        resolve,
        threadId,
        runId,
        traceId,
      });
      const general = getGeneralSettings();
      log.info("dispatch", {
        traceId,
        runId,
        threadId,
        meta: withTextPreview(message, "message", PREVIEW_BODY_CHARS),
      });
      try {
        this.send({
          channel: "utility",
          kind: "run",
          runId,
          threadId,
          traceId,
          sessionId,
          workspaceId,
          sessionTitle,
          command: {
            threadId,
            message,
            history: command.history,
            traceId,
            workspaceRoot: command.workspaceRoot,
            workspaceName: command.workspaceName,
          },
          ...this.modelPayload(threadId),
          ...this.chatModePayload(threadId),
          ...this.subagentsPayload(command.workspaceRoot),
          model: resolvePrimaryModelSettings(),
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
          ...this.shellPayload(),
          logTruncateLongContent: general.logTruncateLongContent,
          loggingEnabled: general.loggingEnabled,
          traceEnabled: general.traceEnabled,
          workspaceRoot: command.workspaceRoot,
          dataDir: getDataDir(),
        });
      } catch (err) {
        this.pending.delete(runId);
        const error = err instanceof Error ? err.message : String(err);
        log.error("dispatch failed", { traceId, runId, threadId, meta: { error } });
        resolve({
          ok: false,
          error,
          runId,
          threadId,
        });
      }
    });
  }

  /**
   * 从 checkpoint 恢复：发送 resume，等待 done/error。
   */
  async resume(
    command: AgentResumeCommand & {
      workspaceRoot?: string;
      workspaceName?: string;
    },
  ): Promise<RunResult> {
    await this.waitUntilReady();
    const threadId = command.threadId.trim();
    const runId = createRunId();
    const traceId = command.traceId?.trim() || createTraceId();
    const general = getGeneralSettings();
    const log = desktopLog("bridge.resume");

    let sessionId: string | undefined;
    let workspaceId: string | undefined;
    let sessionTitle: string | undefined;
    try {
      setSessionRunStatus(threadId, "running", {
        byThread: true,
        activeRunId: runId,
        interruptReason: null,
      });
      const session = getSessionByThreadId(threadId);
      sessionId = session?.id;
      workspaceId = session?.workspaceId;
      sessionTitle = session?.title;
      broadcastThreadsChanged();
    } catch {
      /* ignore */
    }

    return new Promise<RunResult>((resolve) => {
      this.pending.set(runId, {
        resolve,
        threadId,
        runId,
        traceId,
      });
      log.info("dispatch", { traceId, runId, threadId });
      try {
        this.send({
          channel: "utility",
          kind: "resume",
          runId,
          sessionId,
          workspaceId,
          sessionTitle,
          command: {
            threadId,
            workspaceName: command.workspaceName,
            traceId,
          },
          workspaceRoot: command.workspaceRoot,
          ...this.modelPayload(threadId),
          ...this.chatModePayload(threadId),
          ...this.subagentsPayload(command.workspaceRoot),
          model: resolvePrimaryModelSettings(),
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
          ...this.shellPayload(),
          logTruncateLongContent: general.logTruncateLongContent,
          loggingEnabled: general.loggingEnabled,
          traceEnabled: general.traceEnabled,
          dataDir: getDataDir(),
        });
      } catch (err) {
        this.pending.delete(runId);
        const error = err instanceof Error ? err.message : String(err);
        log.error("dispatch failed", { traceId, runId, threadId, meta: { error } });
        resolve({ ok: false, error, runId, threadId });
      }
    });
  }

  /**
   * 分发事件给监听者；done/error 时 resolve 对应 pending Promise。
   */
  private onAgentEvent(event: AgentEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }

    const pending = this.pending.get(event.runId);
    if (!pending) return;

    if (event.type !== "done" && event.type !== "error") return;
    this.pending.delete(event.runId);
    desktopLog("bridge.run").info(event.type === "done" ? "done" : "error", {
      traceId: pending.traceId,
      runId: event.runId,
      threadId: event.threadId,
      meta:
        event.type === "error"
          ? { error: event.error }
          : withTextPreview(event.text, "text", PREVIEW_BODY_CHARS),
    });
    if (event.type === "done") {
      pending.resolve({
        ok: true,
        text: event.text,
        runId: event.runId,
        threadId: event.threadId,
      });
    } else {
      pending.resolve({
        ok: false,
        error: event.error,
        runId: event.runId,
        threadId: event.threadId,
      });
    }
  }
}
