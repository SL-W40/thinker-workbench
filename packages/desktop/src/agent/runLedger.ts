/**
 * Run 生命周期账本：会话运行状态的唯一写入者。
 * 分配 runId、提交 running / queued、幂等 settle，并在结算时释放本 run 绑定资源。
 * 并行槽满时进入全局 FIFO；出队才写成 running 并派发。轮次内容只留在内存。
 */
import {
  type AgentErrorCode,
  type AgentEvent,
  type AgentResumeCommand,
  type AgentRunCommand,
  createRunId,
  createTraceId,
  IpcChannels,
  type RunResult,
  type SessionRunStatus,
} from "@thinker-workbench/shared";
import { BrowserWindow } from "electron";
import {
  assertWorkspaceRoot,
  countRunningSessions,
  finalizeOrphanPendingMessages,
  getSession,
  getSessionByActiveRunId,
  getWorkspace,
  setSessionRunStatus,
  upsertSessionForRun,
} from "../db/workspacesStore";
import { broadcastThreadsChanged } from "../ipc/workspacesHandlers";
import { desktopLog } from "../log/setup";
import { clearHitlForRun } from "../notify/hitlNotify";
import type { AgentBridge } from "../utility/AgentBridge";
import { reclaimRunResources } from "../utility/reclaimRunResources";
import { releaseBrowserLease } from "./resourceGovernor";
import {
  type AdmitRunRequest,
  admitRun,
  getMaxParallelRuns,
  getMaxQueuedRuns,
  getQueueTimeoutMin,
  NO_SESSION,
  NO_WORKSPACE,
  parallelCapError,
  queueFullError,
  queueTimeoutError,
  resolveSession,
  THREAD_BUSY,
} from "./runCoordinator";

/** settle 终态（与引擎 AgentErrorCode / done 对齐）。 */
export type RunOutcome = "done" | AgentErrorCode;

/** 入队时冻结的轮次内容。模型 / 权限在派发时再读，不写进这里。 */
export type AdmissionTurn =
  | { kind: "run"; command: AgentRunCommand }
  | { kind: "resume"; command: AgentResumeCommand };

/** 出队后交给运输层的一次派发。 */
export type AdmissionDispatchJob = {
  runId: string;
  threadId: string;
  traceId: string;
  sessionId: string;
  workspaceRoot: string;
  workspaceName?: string;
  turn: AdmissionTurn;
  /** 排队等待被调度的时长（毫秒）；随 UtilityRun 下发，engine 并入终态耗时。 */
  queuedMs?: number;
};

type RunPhase = "queued" | "running";

/** 进行中的账本条目。 */
type OpenRun = {
  runId: string;
  sessionId: string;
  threadId: string;
  traceId: string;
  titleHint?: string;
  workspaceId: string;
  workspaceRoot: string;
  workspaceName?: string;
  settled: boolean;
  cancelRequested: boolean;
  /** 是否已成功 postMessage 到 utility。 */
  dispatched: boolean;
  phase: RunPhase;
  /** 入队顺序，只增不减。 */
  seq: number;
  /** 入队时刻；仅排队项有值，用于算排队时长。 */
  queuedAt?: number;
  /** 出队时结算的排队时长（毫秒）；随派发下发给 engine。 */
  queuedMs?: number;
  turn?: AdmissionTurn;
  timer?: ReturnType<typeof setTimeout>;
  /** 已经发起过一次派发，避免 pump 与 handler 各 kick 一次。 */
  kickStarted?: boolean;
};

export type BeginRunRequest = AdmitRunRequest & {
  titleHint?: string;
  traceId?: string;
  turn?: AdmissionTurn;
};

export type BeginRunOk = {
  ok: true;
  runId: string;
  threadId: string;
  sessionId: string;
  traceId: string;
  workspaceRoot: string;
  workspaceName?: string;
  /** 为 true 时尚未占并行槽。 */
  queued?: boolean;
  /** FIFO 名次，从 1 起。 */
  queuePosition?: number;
};

export type BeginRunErr = { ok: false; error: string };
export type BeginRunResult = BeginRunOk | BeginRunErr;

export type SettleDetail = {
  error?: string;
  text?: string;
  /** 结算后是否向渲染进程广播合成终态事件（无引擎事件时）。 */
  emitEvent?: boolean;
};

type Dispatcher = (job: AdmissionDispatchJob) => Promise<void>;
type AdmissionGate = () => string | null;

/**
 * 主进程 run 账本（单例）。
 * Bridge 只负责运输；本类独占 SQLite run_status / activeRunId。
 */
class RunLedger {
  private readonly byRunId = new Map<string, OpenRun>();
  private readonly bySessionId = new Map<string, string>();
  /** 排队 runId，下标 0 是队头。 */
  private readonly fifo: string[] = [];
  private nextSeq = 1;
  private bridge: AgentBridge | null = null;
  private dispatcher: Dispatcher | null = null;
  private admissionGate: AdmissionGate | null = null;
  private pumping = false;
  private pumpAgain = false;
  /** utility 退出期间不要把排队项升格进已死的子进程。 */
  private suspendPump = false;

  /** 绑定运输层（注册 IPC 时调用一次）。 */
  attachBridge(bridge: AgentBridge): void {
    this.bridge = bridge;
  }

  /** 由 agentHandlers 注册：升格后的实际 dispatchRun / dispatchResume。 */
  attachDispatcher(dispatcher: Dispatcher): void {
    this.dispatcher = dispatcher;
  }

  /**
   * 出队前的附加门槛（例如密钥未解锁）。
   * 返回错误文案则本条失败并继续下一条，不占并行槽。
   */
  attachAdmissionGate(gate: AdmissionGate): void {
    this.admissionGate = gate;
  }

  /** 按 runId 查未结算条目。 */
  getOpen(runId: string): OpenRun | undefined {
    const entry = this.byRunId.get(runId);
    return entry && !entry.settled ? entry : undefined;
  }

  /** 未结算条目的阶段；测试与取消路径用。 */
  getPhase(runId: string): RunPhase | undefined {
    return this.getOpen(runId)?.phase;
  }

  /** 会话当前未结算 runId。 */
  getRunIdForSession(sessionId: string): string | undefined {
    const id = sessionId.trim();
    if (!id) return undefined;
    const runId = this.bySessionId.get(id);
    if (!runId) return undefined;
    const entry = this.byRunId.get(runId);
    return entry && !entry.settled ? runId : undefined;
  }

  /** 排队名次（从 1 起）。不在队列中则 undefined。 */
  queuePosition(sessionId: string): number | undefined {
    const runId = this.getRunIdForSession(sessionId);
    if (!runId) return undefined;
    const idx = this.fifo.indexOf(runId);
    return idx >= 0 ? idx + 1 : undefined;
  }

  /**
   * 准入并提交。槽够且队列为空则直接 running；否则入队。
   * 成功后调用方即可返回 id。直接 running 的条目再 kick；排队项等 pump。
   */
  begin(request: BeginRunRequest): BeginRunResult {
    const admitted = admitRun(request);
    if (!admitted.ok) return admitted;

    const sessionId = admitted.session.id;
    const existingId = this.bySessionId.get(sessionId);
    if (existingId && this.getOpen(existingId)) {
      return { ok: false, error: THREAD_BUSY };
    }

    const running = countRunningSessions();
    const maxParallel = getMaxParallelRuns();
    const maxQueued = getMaxQueuedRuns();
    const queueBlocksDirect = this.fifo.length > 0;
    const atCap = running >= maxParallel;

    if (!atCap && !queueBlocksDirect) {
      return this.commit(admitted, request, "running");
    }

    if (maxQueued === 0 || this.fifo.length >= maxQueued) {
      return {
        ok: false,
        error: maxQueued === 0 ? parallelCapError(maxParallel) : queueFullError(maxQueued),
      };
    }

    const queued = this.commit(admitted, request, "queued");
    if (!queued.ok) return queued;
    // 队头若因本次入队时已有空槽而被升格，返回值要反映升格后的阶段
    this.pump();
    const entry = this.getOpen(queued.runId);
    if (!entry || entry.phase === "running") {
      return { ...queued, queued: undefined, queuePosition: undefined };
    }
    return {
      ...queued,
      queued: true,
      queuePosition: this.queuePosition(entry.sessionId),
    };
  }

  /** 对已是 running 且未派发的条目启动运输。排队项调用无效。 */
  kick(runId: string): void {
    const entry = this.getOpen(runId);
    if (entry) this.kickEntry(entry);
  }

  /**
   * 有空槽就把队头升为 running 并派发，直到槽满或队列空。
   * 同步执行，避免新的 begin 插到队头前面。
   */
  pump(): void {
    if (this.suspendPump) return;
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pumping = true;
    try {
      while (true) {
        if (countRunningSessions() >= getMaxParallelRuns()) break;
        const headId = this.fifo[0];
        if (!headId) break;
        const head = this.byRunId.get(headId);
        if (!head || head.settled || head.phase !== "queued") {
          this.fifo.shift();
          continue;
        }
        if (!this.promote(head)) continue;
        this.kickEntry(head);
      }
    } finally {
      this.pumping = false;
      if (this.pumpAgain) {
        this.pumpAgain = false;
        this.pump();
      }
    }
  }

  /** 标记已成功派发到 utility。 */
  markDispatched(runId: string): void {
    const entry = this.byRunId.get(runId);
    if (entry && !entry.settled) entry.dispatched = true;
  }

  /** 派发失败：同一次 settle(failed)，不留下 running。 */
  dispatchFailed(runId: string, error: string): void {
    this.settle(runId, "failed", { error, emitEvent: true });
  }

  /**
   * 按 sessionId 或 runId 请求取消。
   * 已派发：尽力通知引擎，等 error(cancelled)；未派发（含排队）或子进程已死：本地立刻 settle。
   */
  requestCancel(options: { runId?: string; sessionId?: string }): { ok: boolean; error?: string } {
    const runId = this.resolveRunId(options);
    if (!runId) {
      return { ok: false, error: "No active run to cancel." };
    }
    const entry = this.getOpen(runId);
    if (!entry) {
      return { ok: false, error: "No active run to cancel." };
    }
    entry.cancelRequested = true;
    this.clearTimer(entry);
    desktopLog("runLedger").info("cancel", {
      traceId: entry.traceId,
      runId,
      threadId: entry.threadId,
      meta: { sessionId: entry.sessionId, dispatched: entry.dispatched, phase: entry.phase },
    });

    const bridge = this.bridge;
    if (!bridge || !entry.dispatched) {
      this.settle(runId, "cancelled", {
        error: "Run cancelled.",
        emitEvent: true,
      });
      return { ok: true };
    }

    try {
      bridge.cancelTransport(runId);
    } catch {
      this.settle(runId, "cancelled", {
        error: "Run cancelled.",
        emitEvent: true,
      });
      return { ok: true };
    }
    return { ok: true };
  }

  /**
   * 幂等结算。已结算的再次到达直接忽略（取消后迟到的 done 不能改写）。
   * 真正写入后同步 pump，让队头补上刚空出的槽。
   * @returns 是否本次真正写入
   */
  settle(runId: string, outcome: RunOutcome, detail: SettleDetail = {}): boolean {
    const id = runId?.trim();
    if (!id) return false;
    const entry = this.byRunId.get(id);
    if (!entry) {
      return this.settleFromDb(id, outcome, detail);
    }
    if (entry.settled) return false;
    entry.settled = true;
    this.clearTimer(entry);
    this.removeFromFifo(id);
    this.bySessionId.delete(entry.sessionId);

    const status = outcomeToSessionStatus(outcome);
    const interruptReason =
      outcome === "done"
        ? null
        : outcome === "cancelled"
          ? "cancelled"
          : outcome === "crashed"
            ? "crash"
            : (detail.error ?? "failed");

    try {
      setSessionRunStatus(entry.sessionId, status, {
        activeRunId: null,
        interruptReason,
      });
    } catch {
      /* 落库失败仍继续释放资源 */
    }

    // 还没派发就结束：渲染进程可能不在这个会话上，把错误写进气泡
    if (entry.phase === "queued" && outcome !== "done") {
      try {
        finalizeOrphanPendingMessages(
          entry.workspaceId,
          entry.sessionId,
          outcome === "cancelled" ? "Run cancelled." : (detail.error ?? "failed"),
          outcome === "cancelled" ? "CANCELLED" : "failed",
        );
      } catch {
        /* 气泡收束失败不挡住释放槽位 */
      }
    }

    // 绑定资源：取消/崩溃回收 PTY+browser；done 不杀脱离的 shell，只释 browser 租约
    if (outcome !== "done") {
      reclaimRunResources([id]);
    } else {
      try {
        releaseBrowserLease(id);
      } catch {
        /* ignore */
      }
    }

    if (this.bridge) {
      clearHitlForRun(id, this.bridge);
      try {
        const { flushPendingMcpReload } =
          require("../ipc/mcpHandlers") as typeof import("../ipc/mcpHandlers");
        flushPendingMcpReload(this.bridge);
      } catch {
        /* ignore */
      }
    }

    broadcastThreadsChanged();

    if (detail.emitEvent) {
      broadcastTerminalEvent(entry, outcome, detail);
    }

    this.byRunId.delete(id);
    desktopLog("runLedger").info("settle", {
      traceId: entry.traceId,
      runId: id,
      threadId: entry.threadId,
      meta: { outcome, sessionId: entry.sessionId, phase: entry.phase },
    });
    this.pump();
    return true;
  }

  /**
   * utility 退出：只结算已经 running 的条目（已请求取消则 cancelled，否则 crashed）。
   * 排队项不依赖子进程，留在队列里，等子进程再次 ready 后由 pump 派发。
   */
  settleAllOnExit(error: string): void {
    this.suspendPump = true;
    try {
      const ids = [...this.byRunId.keys()];
      for (const runId of ids) {
        const entry = this.byRunId.get(runId);
        if (!entry || entry.settled || entry.phase !== "running") continue;
        const outcome: RunOutcome = entry.cancelRequested ? "cancelled" : "crashed";
        this.settle(runId, outcome, {
          error: entry.cancelRequested ? "Run cancelled." : error,
          emitEvent: true,
        });
      }
    } finally {
      this.suspendPump = false;
    }
  }

  /** 从引擎事件推导 outcome 并 settle。 */
  settleFromEvent(event: AgentEvent): boolean {
    if (event.type === "done") {
      return this.settle(event.runId, "done", { text: event.text });
    }
    if (event.type === "error") {
      const code = event.code ?? "failed";
      return this.settle(event.runId, code, { error: event.error });
    }
    return false;
  }

  /** 测试收尾：结算全部未结束条目（含排队），且不顺便升格。 */
  discardForTests(): void {
    this.suspendPump = true;
    this.pumpAgain = false;
    try {
      for (const runId of [...this.byRunId.keys()]) {
        const entry = this.byRunId.get(runId);
        if (!entry || entry.settled) continue;
        this.settle(runId, "cancelled", { error: "test cleanup" });
      }
    } finally {
      this.suspendPump = false;
    }
  }

  private commit(
    admitted: Extract<ReturnType<typeof admitRun>, { ok: true }>,
    request: BeginRunRequest,
    phase: RunPhase,
  ): BeginRunResult {
    const sessionId = admitted.session.id;
    const runId = createRunId();
    const threadId = admitted.threadId;
    const traceId = request.traceId?.trim() || createTraceId();
    const seq = this.nextSeq++;

    try {
      upsertSessionForRun({
        threadId,
        workspaceId: admitted.session.workspaceId,
        titleHint: request.titleHint,
        runStatus: phase,
        activeRunId: runId,
        interruptReason: null,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }

    const entry: OpenRun = {
      runId,
      sessionId,
      threadId,
      traceId,
      titleHint: request.titleHint,
      workspaceId: admitted.session.workspaceId,
      workspaceRoot: admitted.workspaceRoot,
      workspaceName: admitted.workspaceName,
      settled: false,
      cancelRequested: false,
      dispatched: false,
      phase,
      seq,
      turn: request.turn,
    };
    this.byRunId.set(runId, entry);
    this.bySessionId.set(sessionId, runId);
    if (phase === "queued") {
      entry.queuedAt = Date.now();
      this.fifo.push(runId);
      this.armTimer(entry);
    }
    broadcastThreadsChanged();

    const queuePosition = phase === "queued" ? this.fifo.indexOf(runId) + 1 : undefined;
    desktopLog("runLedger").info("begin", {
      traceId,
      runId,
      threadId,
      meta: { sessionId, phase, queuePosition },
    });

    return {
      ok: true,
      runId,
      threadId,
      sessionId,
      traceId,
      workspaceRoot: admitted.workspaceRoot,
      workspaceName: admitted.workspaceName,
      ...(phase === "queued" ? { queued: true, queuePosition } : {}),
    };
  }

  /**
   * 把队头写成 running。工作区或门槛失败则本条 failed，不占槽。
   * @returns 是否已占上并行槽
   */
  private promote(entry: OpenRun): boolean {
    this.clearTimer(entry);
    const fail = (error: string): false => {
      this.settle(entry.runId, "failed", { error, emitEvent: true });
      return false;
    };

    try {
      const gateError = this.admissionGate?.() ?? null;
      if (gateError) return fail(gateError);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }

    const session = getSession(entry.sessionId);
    if (!session) return fail(NO_SESSION);
    const workspace = getWorkspace(session.workspaceId);
    if (!workspace?.rootPath?.trim()) return fail(NO_WORKSPACE);

    let workspaceRoot: string;
    try {
      workspaceRoot = assertWorkspaceRoot(workspace.rootPath);
    } catch {
      return fail(NO_WORKSPACE);
    }

    try {
      setSessionRunStatus(session.id, "running", {
        activeRunId: entry.runId,
        interruptReason: null,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }

    entry.phase = "running";
    // 出队即结算排队时长：并入终态耗时，让用户看到「等了多久 + 跑了多久」
    entry.queuedMs = entry.queuedAt ? Math.max(0, Date.now() - entry.queuedAt) : 0;
    entry.workspaceRoot = workspaceRoot;
    entry.workspaceName = workspace.name || entry.workspaceName;
    this.removeFromFifo(entry.runId);
    broadcastThreadsChanged();
    desktopLog("runLedger").info("promote", {
      traceId: entry.traceId,
      runId: entry.runId,
      threadId: entry.threadId,
      meta: { sessionId: entry.sessionId },
    });
    return true;
  }

  private kickEntry(entry: OpenRun): void {
    if (entry.phase !== "running" || entry.dispatched || entry.settled || entry.kickStarted) return;
    if (!this.dispatcher || !entry.turn) return;
    entry.kickStarted = true;
    const job: AdmissionDispatchJob = {
      runId: entry.runId,
      threadId: entry.threadId,
      traceId: entry.traceId,
      sessionId: entry.sessionId,
      workspaceRoot: entry.workspaceRoot,
      workspaceName: entry.workspaceName,
      queuedMs: entry.queuedMs,
      turn: entry.turn,
    };
    void this.dispatcher(job).catch((err) => {
      if (!this.getOpen(entry.runId)) return;
      const error = err instanceof Error ? err.message : String(err);
      this.dispatchFailed(entry.runId, error);
    });
  }

  private armTimer(entry: OpenRun): void {
    this.clearTimer(entry);
    const mins = getQueueTimeoutMin();
    if (mins <= 0) return;
    const seq = entry.seq;
    const timer = setTimeout(() => {
      const cur = this.byRunId.get(entry.runId);
      if (!cur || cur.settled || cur.phase !== "queued" || cur.seq !== seq) return;
      this.settle(cur.runId, "failed", {
        error: queueTimeoutError(mins),
        emitEvent: true,
      });
    }, mins * 60_000);
    const unref = (timer as { unref?: () => void }).unref;
    if (typeof unref === "function") unref.call(timer);
    entry.timer = timer;
  }

  private clearTimer(entry: OpenRun): void {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  private removeFromFifo(runId: string): void {
    const idx = this.fifo.indexOf(runId);
    if (idx >= 0) this.fifo.splice(idx, 1);
  }

  private resolveRunId(options: { runId?: string; sessionId?: string }): string | undefined {
    const fromRun = options.runId?.trim();
    if (fromRun && this.getOpen(fromRun)) return fromRun;
    const sid = options.sessionId?.trim();
    if (sid) {
      const fromSession = this.getRunIdForSession(sid);
      if (fromSession) return fromSession;
      const session = getSession(sid);
      const dbRun = session?.activeRunId?.trim();
      if (dbRun) return dbRun;
    }
    if (fromRun) {
      const byDb = getSessionByActiveRunId(fromRun);
      if (byDb) return fromRun;
    }
    return fromRun || undefined;
  }

  private settleFromDb(runId: string, outcome: RunOutcome, detail: SettleDetail): boolean {
    const session = getSessionByActiveRunId(runId);
    if (!session || session.activeRunId !== runId) return false;
    if (session.runStatus !== "running" && session.runStatus !== "queued") return false;
    const status = outcomeToSessionStatus(outcome);
    try {
      setSessionRunStatus(session.id, status, {
        activeRunId: null,
        interruptReason:
          outcome === "done"
            ? null
            : outcome === "cancelled"
              ? "cancelled"
              : outcome === "crashed"
                ? "crash"
                : (detail.error ?? "failed"),
      });
    } catch {
      return false;
    }
    if (session.runStatus === "queued" && outcome !== "done") {
      try {
        finalizeOrphanPendingMessages(
          session.workspaceId,
          session.id,
          outcome === "cancelled" ? "Run cancelled." : (detail.error ?? "failed"),
          outcome === "cancelled" ? "CANCELLED" : "failed",
        );
      } catch {
        /* 气泡收束失败不挡住释放槽位 */
      }
    }
    if (outcome !== "done") reclaimRunResources([runId]);
    if (this.bridge) clearHitlForRun(runId, this.bridge);
    broadcastThreadsChanged();
    if (detail.emitEvent) {
      broadcastTerminalEvent(
        {
          runId,
          sessionId: session.id,
          threadId: session.threadId,
          traceId: "",
          workspaceId: session.workspaceId,
          workspaceRoot: "",
          settled: true,
          cancelRequested: false,
          dispatched: session.runStatus === "running",
          phase: session.runStatus === "queued" ? "queued" : "running",
          seq: 0,
        },
        outcome,
        detail,
      );
    }
    this.pump();
    return true;
  }
}

function outcomeToSessionStatus(outcome: RunOutcome): SessionRunStatus {
  switch (outcome) {
    case "done":
      return "idle";
    case "cancelled":
      return "cancelled";
    case "crashed":
      return "crashed";
    case "failed":
      return "failed";
  }
}

function broadcastTerminalEvent(entry: OpenRun, outcome: RunOutcome, detail: SettleDetail): void {
  const base = {
    chatSessionId: entry.sessionId,
    threadId: entry.threadId,
    runId: entry.runId,
    ts: Date.now(),
  };
  const event: AgentEvent =
    outcome === "done"
      ? { type: "done", ...base, text: detail.text ?? "" }
      : {
          type: "error",
          ...base,
          error: detail.error ?? outcome,
          code:
            outcome === "cancelled" || outcome === "crashed" || outcome === "failed"
              ? outcome
              : "failed",
        };
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.agentEvent, event);
      }
    }
  } catch {
    /* 测试环境无 Electron 时忽略 */
  }
}

/** 进程级单例。 */
export const runLedger = new RunLedger();

/** 构造已接受的 RunResult。排队时带上名次，避免渲染进程把它当成正在跑。 */
export function acceptedRunResult(begun: BeginRunOk): RunResult {
  return {
    ok: true,
    accepted: true,
    runId: begun.runId,
    threadId: begun.threadId,
    ...(begun.queued ? { queued: true as const, queuePosition: begun.queuePosition } : {}),
  };
}

/** 解析 cancel 目标会话（测试 / 兼容导出）。 */
export function resolveSessionForLedgerCancel(options: {
  runId?: string;
  sessionId?: string;
}): ReturnType<typeof resolveSession> {
  if (options.sessionId) return resolveSession(options.sessionId, undefined);
  if (options.runId) return getSessionByActiveRunId(options.runId);
  return null;
}
