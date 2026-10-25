/**
 * 主进程与 Agent utilityProcess 之间的消息桥。
 *
 * 负责：attach 子进程、等待 ready、派发 run/cancel/hello、
 * 将 AgentEvent / LogRecord 分发给监听者。会话终态由 RunLedger 收口。
 */

import {
  type AgentEvent,
  type AgentResumeCommand,
  type AgentRunCommand,
  buildRuntimeSettings,
  type ChatMode,
  type ContextUsageRequest,
  type ContextUsageSnapshot,
  createId,
  DEFAULT_CHAT_MODE,
  DEFAULT_CONTEXT_WINDOW,
  emptyContextUsageSnapshot,
  type HitlResponse,
  type LogRecord,
  type ModelSelection,
  normalizeChatMode,
  PREVIEW_BODY_CHARS,
  type UtilityToChild,
  withTextPreview,
} from "@thinker-workbench/shared";
import type { UtilityProcess } from "electron";
import { runLedger } from "../agent/runLedger";
import { browserSessionManager } from "../browser/BrowserSessionManager";
import { getDataDir, getWorkspaceCheckpointDir } from "../config/paths";
import {
  getGeneralSettings,
  getModelCatalog,
  getModelCatalogSnapshot,
  resolvePrimaryModelMeta,
  unlockModelSecretsForRun,
} from "../config/settingsStore";
import { listAgents } from "../customize/agentsStore";
import {
  getActiveSessionId,
  getSession,
  getSessionByThreadId,
  getSessionChatMode,
  getSessionModelSelection,
} from "../db/workspacesStore";
import { desktopLog } from "../log/setup";
import { shellFactsForAgent } from "../terminal/detectShellProfiles";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";
import { endTraceSpan, startTraceSpan } from "../trace/writeSpan";
import { handleBrowserRequest, handleGitRequest, handlePtyRequest } from "./agentHostRequests";
import { isUtilityToParent } from "./transfer";

/** 已派发、供 cancel 附带 sessionId 的轻量记录（终态由 RunLedger 收口）。 */
type DispatchedRun = {
  sessionId?: string;
  threadId: string;
  runId: string;
  traceId: string;
};

/** 等待 contextUsage 结果。 */
type PendingContextUsage = {
  resolve: (usage: ContextUsageSnapshot) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** 等待 checkpoint 清理结果。 */
type PendingCheckpointClear = {
  resolve: (ok: boolean) => void;
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
  /** runId → 已派发记录（cancel 用；结算后删除）。 */
  private readonly dispatched = new Map<string, DispatchedRun>();
  /** AgentEvent 订阅者。 */
  private readonly eventListeners = new Set<(event: AgentEvent) => void>();
  /** LogRecord 订阅者（来自 agent utility）。 */
  private readonly logListeners = new Set<(record: LogRecord) => void>();
  /** requestId → contextUsage 等待者。 */
  private readonly pendingContextUsage = new Map<string, PendingContextUsage>();
  /** requestId → checkpoint 清理等待者。 */
  private readonly pendingCheckpointClear = new Map<string, PendingCheckpointClear>();
  /** ready 握手成功后的旁路订阅（如重置重启退避）。 */
  private readonly readyListeners = new Set<() => void>();

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
        for (const listener of this.readyListeners) {
          try {
            listener();
          } catch {
            /* 旁路监听失败不阻断握手 */
          }
        }
        return;
      }
      if (raw.kind === "event") {
        this.onAgentEvent(raw.event);
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
      if (raw.kind === "checkpointClearResult") {
        const pending = this.pendingCheckpointClear.get(raw.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingCheckpointClear.delete(raw.requestId);
        pending.resolve(raw.ok);
        return;
      }
      if (raw.kind === "ptyRequest") {
        void handlePtyRequest((message) => this.send(message), raw);
        return;
      }
      if (raw.kind === "browserRequest") {
        void handleBrowserRequest((message) => this.send(message), raw);
        return;
      }
      if (raw.kind === "gitRequest") {
        void handleGitRequest((message) => this.send(message), raw);
        return;
      }
      if (raw.kind === "hitl") {
        this.onAgentEvent({
          type: "hitl",
          threadId: raw.request.threadId,
          runId: raw.request.runId,
          ts: Date.now(),
          phase: "request",
          hitlId: raw.request.hitlId,
          kind: raw.request.kind,
          request: raw.request,
        });
        return;
      }
      if (raw.kind === "mcpStatus") {
        try {
          const { handleMcpStatusFromAgent } =
            require("../ipc/mcpHandlers") as typeof import("../ipc/mcpHandlers");
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
              spanId: s.id,
              sessionId: s.sessionId,
              agentRunId: s.agentRunId,
              traceId: s.traceId,
              parentId: s.parentId,
              taskId: s.taskId,
              name: s.name,
              runType: s.runType,
              source: s.source ?? "agent",
              summary: s.summary,
              attrs,
              input: s.input,
              startTs: s.startTs,
              workspaceId: typeof attrs.workspaceId === "string" ? attrs.workspaceId : undefined,
              threadId: typeof attrs.threadId === "string" ? attrs.threadId : undefined,
              title:
                typeof attrs.sessionTitle === "string"
                  ? attrs.sessionTitle
                  : typeof attrs.title === "string"
                    ? attrs.title
                    : undefined,
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
          /* ignore */
        }
        return;
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

  /**
   * 子进程退出时调用：清空 child/ready，未结算 run 交 RunLedger 统一 settle。
   * @param code 退出码，可能为 null
   */
  markExited(code: number | null): void {
    this.ready = false;
    this.child = null;
    const error = `Agent utilityProcess exited (${code ?? "null"}).`;
    for (const [runId, d] of this.dispatched) {
      desktopLog("bridge").error("child exit during run", {
        traceId: d.traceId,
        runId,
        threadId: d.threadId,
        meta: { code },
      });
    }
    this.dispatched.clear();
    runLedger.settleAllOnExit(error);
    for (const [id, pending] of this.pendingContextUsage) {
      clearTimeout(pending.timer);
      pending.resolve(
        emptyContextUsageSnapshot(this.resolveContextUsageMeta().limit, "utility_not_ready"),
      );
      this.pendingContextUsage.delete(id);
    }
    for (const [id, pending] of this.pendingCheckpointClear) {
      clearTimeout(pending.timer);
      pending.resolve(false);
      this.pendingCheckpointClear.delete(id);
    }
  }

  /**
   * 订阅 utility ready 握手（重启退避在此清零）。
   * @returns 取消订阅函数
   */
  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  /**
   * 解析估算用的上下文窗口（不解锁钥匙串）。
   *
   * 子进程拿到的是「无明文 apiKey」的快照，`resolveModelSettings` 会返回 null，
   * 因此窗口必须由主进程解析后随消息下发，否则 UI 永远显示默认 128K。
   */
  private resolveContextUsageMeta(): {
    limit: number;
    allowEmoji: boolean;
    threadId?: string;
  } {
    const activeId = getActiveSessionId();
    const activeSession = activeId ? getSession(activeId) : null;
    // 用量估算只需 contextWindow 等元数据，禁止走 modelPayload（会弹钥匙串）
    const { catalog, selection } = this.modelPayloadSnapshot(activeSession?.threadId);
    const meta = resolvePrimaryModelMeta(catalog, selection);
    return {
      limit:
        typeof meta.contextWindow === "number" && meta.contextWindow > 0
          ? meta.contextWindow
          : DEFAULT_CONTEXT_WINDOW,
      allowEmoji: meta.allowEmoji ?? false,
      threadId: activeSession?.threadId,
    };
  }

  /**
   * 向 utility 请求上下文占用快照（与 assembleContext 同源）。
   * 超时 / 未就绪 / send 失败都返回带原因的空快照（数值不可信，UI 显示「不可用」）。
   */
  async getContextUsage(
    request: ContextUsageRequest = {},
    timeoutMs = 8_000,
  ): Promise<ContextUsageSnapshot> {
    let meta = this.resolveContextUsageMeta();
    try {
      await this.waitUntilReady(timeoutMs);
    } catch {
      return emptyContextUsageSnapshot(meta.limit, "utility_not_ready");
    }
    // ready 等待期间模型可能已切换：重取一次窗口
    meta = this.resolveContextUsageMeta();
    const requestId = createId("ctx");
    const general = getGeneralSettings();
    const { catalog, selection } = this.modelPayloadSnapshot(meta.threadId);
    const chatMode = this.chatModePayload(meta.threadId).chatMode;
    return new Promise<ContextUsageSnapshot>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingContextUsage.delete(requestId);
        resolve(emptyContextUsageSnapshot(meta.limit, "utility_timeout"));
      }, timeoutMs);
      this.pendingContextUsage.set(requestId, { resolve, timer });
      try {
        this.send({
          channel: "utility",
          kind: "contextUsage",
          requestId,
          request,
          catalog,
          selection,
          aiLocale: general.aiLocale,
          workspaceAccess: general.workspaceAccess,
          allowAiDeleteFiles: general.allowAiDeleteFiles,
          workspaceRoot: request.workspaceRoot,
          dataDir: getDataDir(),
          contextWindow: meta.limit,
          allowEmoji: meta.allowEmoji,
          chatMode,
        });
      } catch (err) {
        clearTimeout(timer);
        this.pendingContextUsage.delete(requestId);
        desktopLog("bridge").warn("contextUsage send failed", {
          meta: { error: err instanceof Error ? err.message : String(err) },
        });
        resolve(emptyContextUsageSnapshot(meta.limit, "utility_not_ready"));
      }
    });
  }

  /**
   * 请求子进程清理会话线程的全部 checkpoint（SqliteSaver 真实存储）。
   * 超时 / 未就绪 / 子进程拒绝均返回 false，由调用方 best-effort 降级。
   */
  async clearThreadCheckpoints(threadId: string, timeoutMs = 8_000): Promise<boolean> {
    try {
      await this.waitUntilReady(timeoutMs);
    } catch {
      return false;
    }
    const requestId = createId("ckc");
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingCheckpointClear.delete(requestId);
        resolve(false);
      }, timeoutMs);
      this.pendingCheckpointClear.set(requestId, { resolve, timer });
      try {
        this.send({ channel: "utility", kind: "checkpointClear", requestId, threadId });
      } catch {
        clearTimeout(timer);
        this.pendingCheckpointClear.delete(requestId);
        resolve(false);
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
   * 向 utility 发送 cancel（运输层）。
   * 子进程未运行时抛错，由 RunLedger 决定是否本地 settle。
   */
  cancelTransport(runId?: string): void {
    const id = runId?.trim();
    if (!id) {
      desktopLog("bridge").warn("cancel ignored: runId required");
      return;
    }
    const d = this.dispatched.get(id);
    desktopLog("bridge").info("cancel", {
      traceId: d?.traceId,
      runId: id,
      threadId: d?.threadId,
      meta: d?.sessionId ? { sessionId: d.sessionId } : undefined,
    });
    terminalSessionManager.killByRunId(id);
    this.send({
      channel: "utility",
      kind: "cancel",
      command: { runId: id, sessionId: d?.sessionId },
    });
  }

  /** @deprecated 使用 cancelTransport；保留别名以免外部调用方断裂。 */
  cancel(runId?: string): void {
    this.cancelTransport(runId);
  }

  /** 取消某聊天会话下全部 in-flight run（删会话 / 清空工作区前调用）。 */
  cancelRunsForSession(sessionId: string): void {
    const id = sessionId.trim();
    if (!id) return;
    runLedger.requestCancel({ sessionId: id });
  }

  /**
   * 取消单个后台 Task（不停止父 run）。
   * 经 utility 走同一 cancelOneBackgroundTask。
   */
  cancelTask(taskId: string, runId?: string): void {
    const id = taskId?.trim();
    if (!id) {
      desktopLog("bridge").warn("cancelTask ignored: taskId required");
      return;
    }
    const rid = runId?.trim() || undefined;
    desktopLog("bridge").info("cancelTask", {
      runId: rid,
      meta: { taskId: id },
    });
    this.send({
      channel: "utility",
      kind: "cancelTask",
      command: { taskId: id, ...(rid ? { runId: rid } : {}) },
    });
  }

  /** 按 runId 查已派发元数据（供 governor 等）。 */
  getPendingRun(runId: string): DispatchedRun | undefined {
    return this.dispatched.get(runId.trim());
  }

  /**
   * 发 run 前再次确认密钥已解锁（IPC 层应已解锁并弹窗；此处作兜底）。
   */
  private assertModelSecretsUnlocked(): void {
    const result = unlockModelSecretsForRun();
    if (result.ok) return;
    const code =
      result.reason === "denied" ? "MODEL_API_KEY_UNLOCK_DENIED" : "MODEL_API_KEY_MISSING";
    throw new Error(code);
  }

  /** 会话覆盖优先的选用解析（不碰钥匙串）。 */
  private resolveSelection(
    catalog: ReturnType<typeof getModelCatalogSnapshot>,
    threadId?: string,
  ): ModelSelection {
    let selection = catalog.selection;
    if (threadId) {
      const session = getSessionByThreadId(threadId);
      if (session) {
        const override = getSessionModelSelection(session.id);
        if (override) selection = override;
      }
    }
    return selection;
  }

  /**
   * 模型目录快照（不解锁密文）。供 contextUsage / 估算等路径。
   */
  private modelPayloadSnapshot(threadId?: string): {
    catalog: ReturnType<typeof getModelCatalogSnapshot>;
    selection: ModelSelection;
  } {
    const catalog = getModelCatalogSnapshot();
    return { catalog, selection: this.resolveSelection(catalog, threadId) };
  }

  /** 解析本轮模型目录与生效选用（会话覆盖优先于全局）。**会解锁钥匙串。** */
  private modelPayload(threadId?: string): {
    catalog: ReturnType<typeof getModelCatalog>;
    selection: ModelSelection;
  } {
    this.assertModelSecretsUnlocked();
    const catalog = getModelCatalog();
    return { catalog, selection: this.resolveSelection(catalog, threadId) };
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
   * 派发已由 RunLedger 提交的 run（不写 DB、不分配 runId）。
   * ready / send 失败时抛错，由调用方 ledger.dispatchFailed。
   */
  async dispatchRun(options: {
    runId: string;
    threadId: string;
    traceId: string;
    sessionId: string;
    command: AgentRunCommand;
    /** 主进程排队时长（毫秒）；engine 会并入终态 durationMs。 */
    queuedMs?: number;
  }): Promise<void> {
    await this.waitUntilReady();
    const { runId, threadId, traceId, sessionId } = options;
    const message = typeof options.command.message === "string" ? options.command.message : "";
    const log = desktopLog("bridge.run");
    const session = getSession(sessionId);
    const workspaceId = session?.workspaceId;
    const sessionTitle = session?.title;
    // 会话既有待办随 run 下发：engine 本轮据此读写，避免「上一轮规划的步骤」丢失
    const sessionTodos = session?.todos ?? [];
    const general = getGeneralSettings();

    // waitUntilReady 期间可能已取消：勿再派发
    if (!runLedger.getOpen(runId)) return;

    this.dispatched.set(runId, { sessionId, threadId, runId, traceId });
    log.info("dispatch", {
      traceId,
      runId,
      threadId,
      meta: {
        ...withTextPreview(message, "message", PREVIEW_BODY_CHARS),
        sessionId,
      },
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
        // 检查点随工作区走：一个 engine 进程可服务多个工作区
        checkpointDir: workspaceId ? getWorkspaceCheckpointDir(workspaceId) : undefined,
        sessionTitle,
        sessionTodos,
        queuedMs: options.queuedMs,
        command: {
          sessionId,
          threadId,
          message,
          images: options.command.images,
          history: options.command.history,
          traceId,
          workspaceRoot: options.command.workspaceRoot,
          workspaceName: options.command.workspaceName,
          contextPaths: options.command.contextPaths,
        },
        ...this.modelPayload(threadId),
        ...this.chatModePayload(threadId),
        ...this.subagentsPayload(options.command.workspaceRoot),
        // 运行时设置（限额 / shell / 访问 / 日志 / trace）统一由 shared builder 组装
        ...buildRuntimeSettings(general, shellFactsForAgent(general.shellProfileId)),
        workspaceRoot: options.command.workspaceRoot,
        dataDir: getDataDir(),
      });
      runLedger.markDispatched(runId);
      // send 与 mark 之间若已 cancelRequested，补一刀 cancel
      const open = runLedger.getOpen(runId);
      if (open?.cancelRequested) {
        try {
          this.cancelTransport(runId);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      this.dispatched.delete(runId);
      throw err;
    }
  }

  /**
   * 派发已由 RunLedger 提交的 resume（不写 DB、不分配 runId）。
   */
  async dispatchResume(options: {
    runId: string;
    threadId: string;
    traceId: string;
    sessionId: string;
    command: AgentResumeCommand & { workspaceRoot?: string; workspaceName?: string };
  }): Promise<void> {
    await this.waitUntilReady();
    const { runId, threadId, traceId, sessionId } = options;
    const general = getGeneralSettings();
    const log = desktopLog("bridge.resume");
    const session = getSession(sessionId) ?? getSessionByThreadId(threadId);
    const workspaceId = session?.workspaceId;
    const sessionTitle = session?.title;
    // 续跑同样播种会话待办
    const sessionTodos = session?.todos ?? [];

    if (!runLedger.getOpen(runId)) return;

    this.dispatched.set(runId, { sessionId, threadId, runId, traceId });
    log.info("dispatch", { traceId, runId, threadId });
    try {
      this.send({
        channel: "utility",
        kind: "resume",
        runId,
        sessionId,
        workspaceId,
        checkpointDir: workspaceId ? getWorkspaceCheckpointDir(workspaceId) : undefined,
        sessionTitle,
        sessionTodos,
        command: {
          sessionId,
          threadId,
          workspaceName: options.command.workspaceName,
          traceId,
        },
        workspaceRoot: options.command.workspaceRoot,
        ...this.modelPayload(threadId),
        ...this.chatModePayload(threadId),
        ...this.subagentsPayload(options.command.workspaceRoot),
        // 运行时设置（限额 / shell / 访问 / 日志 / trace）统一由 shared builder 组装
        ...buildRuntimeSettings(general, shellFactsForAgent(general.shellProfileId)),
        dataDir: getDataDir(),
      });
      runLedger.markDispatched(runId);
      const open = runLedger.getOpen(runId);
      if (open?.cancelRequested) {
        try {
          this.cancelTransport(runId);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      this.dispatched.delete(runId);
      throw err;
    }
  }

  /**
   * 分发事件给监听者；终态时从 dispatched 表移除（DB 由 RunLedger 收口）。
   */
  private onAgentEvent(event: AgentEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }

    if (event.type !== "done" && event.type !== "error") return;
    const d = this.dispatched.get(event.runId);
    this.dispatched.delete(event.runId);
    // 浏览器蒙层没有「接管」按钮：run 结束（完成 / 出错 / 被停止）即交还控制权
    void browserSessionManager.releaseLock();
    desktopLog("bridge.run").info(event.type === "done" ? "done" : "error", {
      traceId: d?.traceId,
      runId: event.runId,
      threadId: event.threadId,
      meta:
        event.type === "error"
          ? { error: event.error, code: event.code }
          : withTextPreview(event.text, "text", PREVIEW_BODY_CHARS),
    });
  }
}
