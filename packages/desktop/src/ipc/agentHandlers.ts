/**
 * Agent 运行相关 IPC：run / cancel / resume / listThreads。
 * 会话运行状态只经 RunLedger 写入；本文件负责广播事件与调用账本。
 */
import {
  type AgentCancelCommand,
  type AgentCancelTaskCommand,
  type AgentResumeCommand,
  type AgentRunCommand,
  type ContextUsageRequest,
  type HitlResponse,
  IpcChannels,
  type LogRecord,
} from "@thinker-workbench/shared";
import { BrowserWindow, type IpcMain } from "electron";
import { NO_WORKSPACE, resolveSession } from "../agent/runCoordinator";
import { type AdmissionDispatchJob, acceptedRunResult, runLedger } from "../agent/runLedger";
import { unlockModelSecretsForRun } from "../config/settingsStore";
import {
  assertWorkspaceRoot,
  getSession,
  getSessionByThreadId,
  getWorkspace,
  healRunningSessions,
  listThreads,
} from "../db/workspacesStore";
import { setDesktopLogBroadcast, writeAgentLogRecord, writeAppLogRecord } from "../log/setup";
import { handleAgentAttention } from "../notify/agentAttention";
import { handleHitlAgentEvent, respondHitl } from "../notify/hitlNotify";
import type { AgentBridge } from "../utility/AgentBridge";
import { flushPendingMcpReload } from "./mcpHandlers";
import { broadcastThreadsChanged } from "./workspacesHandlers";

/**
 * 发消息 / 恢复前先解锁 API key；失败则不派发。
 * `UNLOCK_DENIED` → renderer 自定义门禁；`MISSING` → 气泡内既有「去设置」引导。
 */
function ensureModelSecretsUnlocked():
  | "MODEL_API_KEY_UNLOCK_DENIED"
  | "MODEL_API_KEY_MISSING"
  | null {
  const unlock = unlockModelSecretsForRun();
  if (unlock.ok) return null;
  return unlock.reason === "denied" ? "MODEL_API_KEY_UNLOCK_DENIED" : "MODEL_API_KEY_MISSING";
}

/**
 * 派发时再解析工作区根并读当前设置（桥内部读取）。
 * 排队期间换模型 / 模式 / 权限，出队后生效。
 */
function dispatchAdmitted(bridge: AgentBridge, job: AdmissionDispatchJob): Promise<void> {
  const secretError = ensureModelSecretsUnlocked();
  if (secretError) {
    runLedger.dispatchFailed(job.runId, secretError);
    return Promise.resolve();
  }
  const session = getSession(job.sessionId);
  const workspace = session ? getWorkspace(session.workspaceId) : null;
  if (!workspace?.rootPath?.trim()) {
    runLedger.dispatchFailed(job.runId, NO_WORKSPACE);
    return Promise.resolve();
  }
  let workspaceRoot: string;
  try {
    workspaceRoot = assertWorkspaceRoot(workspace.rootPath);
  } catch {
    runLedger.dispatchFailed(job.runId, NO_WORKSPACE);
    return Promise.resolve();
  }
  const workspaceName = workspace.name || job.workspaceName;
  if (job.turn.kind === "resume") {
    return bridge.dispatchResume({
      runId: job.runId,
      threadId: job.threadId,
      traceId: job.traceId,
      sessionId: job.sessionId,
      command: {
        ...job.turn.command,
        sessionId: job.sessionId,
        threadId: job.threadId,
        workspaceRoot,
        workspaceName,
        traceId: job.traceId,
      },
    });
  }
  return bridge.dispatchRun({
    runId: job.runId,
    threadId: job.threadId,
    traceId: job.traceId,
    sessionId: job.sessionId,
    command: {
      ...job.turn.command,
      sessionId: job.sessionId,
      threadId: job.threadId,
      workspaceRoot,
      workspaceName,
      traceId: job.traceId,
    },
  });
}

function broadcastLog(record: LogRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.logEvent, record);
  }
}

/**
 * 注册 Agent 通道，并订阅 bridge 事件以广播 + 注意力通知 + 账本结算。
 */
export function registerAgentHandlers(ipcMain: IpcMain, bridge: AgentBridge): void {
  setDesktopLogBroadcast(broadcastLog);
  bridge.onLog(writeAgentLogRecord);
  runLedger.attachBridge(bridge);
  runLedger.attachDispatcher((job) => dispatchAdmitted(bridge, job));
  runLedger.attachAdmissionGate(() => ensureModelSecretsUnlocked());

  try {
    if (healRunningSessions() > 0) broadcastThreadsChanged();
  } catch {
    /* db 尚未就绪时忽略 */
  }

  ipcMain.on(IpcChannels.logRecord, (_evt, record: LogRecord) => {
    writeAppLogRecord(record);
  });

  bridge.onEvent((event) => {
    handleAgentAttention(event);
    handleHitlAgentEvent(event, bridge);

    const chatSessionId =
      event.chatSessionId?.trim() || getSessionByThreadId(event.threadId)?.id || undefined;
    const enriched = chatSessionId && !event.chatSessionId ? { ...event, chatSessionId } : event;

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.agentEvent, enriched);
    }

    try {
      if (enriched.type === "done" || enriched.type === "error") {
        const wrote = runLedger.settleFromEvent(enriched);
        if (wrote) flushPendingMcpReload(bridge);
      }
    } catch {
      /* 落库失败不阻断事件 */
    }
  });

  ipcMain.handle(IpcChannels.agentRun, async (_evt, payload: AgentRunCommand | string) => {
    const command: AgentRunCommand =
      typeof payload === "string"
        ? { message: payload }
        : {
            message: payload?.message ?? "",
            images: payload?.images,
            sessionId: payload?.sessionId,
            threadId: payload?.threadId,
            history: payload?.history,
            traceId: payload?.traceId,
            workspaceRoot: payload?.workspaceRoot,
            workspaceName: payload?.workspaceName,
            contextPaths: payload?.contextPaths,
          };

    const secretError = ensureModelSecretsUnlocked();
    if (secretError) {
      return { ok: false as const, error: secretError };
    }

    const begun = runLedger.begin({
      sessionId: command.sessionId,
      threadId: command.threadId,
      workspaceName: command.workspaceName,
      titleHint: command.message,
      traceId: command.traceId,
      turn: { kind: "run", command },
    });
    if (!begun.ok) {
      return { ok: false as const, error: begun.error };
    }

    // 排队项等 pump；直接 running 的在返回前 kick（内部已防重复派发）
    if (!begun.queued) runLedger.kick(begun.runId);
    return acceptedRunResult(begun);
  });

  ipcMain.handle(IpcChannels.agentCancel, async (_evt, payload?: AgentCancelCommand | string) => {
    const runId = typeof payload === "string" ? payload.trim() : (payload?.runId?.trim() ?? "");
    const sessionId = typeof payload === "string" ? undefined : payload?.sessionId?.trim();
    if (!runId && !sessionId) {
      return { ok: false as const, error: "runId or sessionId is required." };
    }
    return runLedger.requestCancel({
      ...(runId ? { runId } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
  });

  ipcMain.handle(IpcChannels.agentCancelTask, async (_evt, payload?: AgentCancelTaskCommand) => {
    const taskId = payload?.taskId?.trim() ?? "";
    const runId = payload?.runId?.trim() || undefined;
    if (!taskId) {
      return { ok: false as const, error: "taskId is required." };
    }
    try {
      bridge.cancelTask(taskId, runId);
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(IpcChannels.agentHitlRespond, async (_evt, response: HitlResponse) => {
    respondHitl(response, bridge);
  });

  ipcMain.handle(IpcChannels.agentListThreads, async () => {
    return listThreads().map((th) => {
      const queuePosition = runLedger.queuePosition(th.sessionId);
      return queuePosition ? { ...th, queuePosition } : th;
    });
  });

  ipcMain.handle(IpcChannels.agentResume, async (_evt, command: AgentResumeCommand) => {
    const session = resolveSession(command.sessionId, command.threadId);
    if (!session) {
      return { ok: false as const, error: "Session not found for resume." };
    }

    const secretError = ensureModelSecretsUnlocked();
    if (secretError) {
      return { ok: false as const, error: secretError };
    }

    const workspace = getWorkspace(session.workspaceId);
    const begun = runLedger.begin({
      sessionId: session.id,
      threadId: session.threadId,
      workspaceName: command.workspaceName?.trim() || workspace?.name,
      traceId: command.traceId,
      turn: { kind: "resume", command },
    });
    if (!begun.ok) {
      return { ok: false as const, error: begun.error };
    }

    if (!begun.queued) runLedger.kick(begun.runId);
    return acceptedRunResult(begun);
  });

  ipcMain.handle(IpcChannels.contextUsage, async (_evt, payload?: ContextUsageRequest) => {
    const contextPaths = Array.isArray(payload?.contextPaths)
      ? payload.contextPaths.filter(
          (p): p is string => typeof p === "string" && p.trim().length > 0,
        )
      : undefined;
    let workspaceRoot: string | undefined;
    if (payload?.workspaceRoot?.trim()) {
      try {
        workspaceRoot = assertWorkspaceRoot(payload.workspaceRoot.trim());
      } catch {
        workspaceRoot = undefined;
      }
    }
    const request: ContextUsageRequest = {
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
      workspaceRoot,
      ...(contextPaths?.length ? { contextPaths } : {}),
    };
    return bridge.getContextUsage(request);
  });
}

/**
 * utility 退出时：账本已结算 running。
 * 保留仍在内存队列里的 queued，避免一次子进程闪退把等待中的发送清掉。
 */
export function onAgentUtilityExited(): void {
  try {
    if (healRunningSessions({ preserveQueued: true }) > 0) broadcastThreadsChanged();
  } catch {
    /* ignore */
  }
}
