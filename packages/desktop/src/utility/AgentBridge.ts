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
  emptyContextUsageSnapshot,
  type AgentEvent,
  type AgentResumeCommand,
  type AgentRunCommand,
  type ContextUsageRequest,
  type ContextUsageSnapshot,
  type LogRecord,
  type RunResult,
  type UtilityToChild,
} from "@thinker-workbench/shared";
import type { UtilityProcess } from "electron";
import { getDataDir } from "../config/paths";
import { getGeneralSettings, getModelSettings } from "../config/settingsStore";
import {
  getSessionByThreadId,
  setSessionRunStatus,
  upsertSessionForRun,
} from "../db/workspacesStore";
import { desktopLog } from "../log/setup";
import { broadcastThreadsChanged } from "../ipc/workspacesHandlers";
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
      }
    });
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
        this.send({
          channel: "utility",
          kind: "contextUsage",
          requestId,
          request,
          model: getModelSettings(),
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
      this.send({
        channel: "utility",
        kind: "cancel",
        command: { runId: id },
      });
    }
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

    try {
      const existing = getSessionByThreadId(threadId);
      upsertSessionForRun({
        threadId,
        workspaceId: existing?.workspaceId,
        titleHint: message,
        runStatus: "running",
        activeRunId: runId,
        interruptReason: null,
      });
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
          command: {
            threadId,
            message,
            history: command.history,
            traceId,
            workspaceRoot: command.workspaceRoot,
            workspaceName: command.workspaceName,
          },
          model: getModelSettings(),
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
          logTruncateLongContent: general.logTruncateLongContent,
          loggingEnabled: general.loggingEnabled,
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

    try {
      setSessionRunStatus(threadId, "running", {
        byThread: true,
        activeRunId: runId,
        interruptReason: null,
      });
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
          command: {
            threadId,
            workspaceName: command.workspaceName,
            traceId,
          },
          workspaceRoot: command.workspaceRoot,
          model: getModelSettings(),
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
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
