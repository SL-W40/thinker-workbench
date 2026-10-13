/**
 * Agent 运行相关 IPC：run / cancel / resume / listThreads，
 * 并将 utilityProcess 事件广播到所有窗口；同步 SQLite run_status。
 * 所有权按 sessionId/runId 寻址，不依赖 activeSession。
 */
import {
  type AgentCancelCommand,
  type AgentResumeCommand,
  type AgentRunCommand,
  type ContextUsageRequest,
  type HitlResponse,
  IpcChannels,
  type LogRecord,
} from "@thinker-workbench/shared";
import { BrowserWindow, type IpcMain } from "electron";
import { admitRun, resolveSession, resolveSessionForCancel } from "../agent/runCoordinator";
import { unlockModelSecretsForRun } from "../config/settingsStore";
import {
  assertWorkspaceRoot,
  getSessionByThreadId,
  getWorkspace,
  healRunningSessions,
  listThreads,
  setSessionRunStatus,
  upsertSessionForRun,
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
 * @returns 可继续时为 null；否则为应返回给渲染进程的错误码
 */
function ensureModelSecretsUnlocked():
  | "MODEL_API_KEY_UNLOCK_DENIED"
  | "MODEL_API_KEY_MISSING"
  | null {
  const unlock = unlockModelSecretsForRun();
  if (unlock.ok) return null;
  return unlock.reason === "denied" ? "MODEL_API_KEY_UNLOCK_DENIED" : "MODEL_API_KEY_MISSING";
}

function broadcastLog(record: LogRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.logEvent, record);
  }
}

/**
 * 注册 Agent 通道，并订阅 bridge 事件以广播 + 注意力通知 + 落库状态。
 */
export function registerAgentHandlers(ipcMain: IpcMain, bridge: AgentBridge): void {
  setDesktopLogBroadcast(broadcastLog);
  // agent 经 bridge 上来：落库 + 广播（勿只 broadcast，Traces 读的是 SQLite）
  bridge.onLog(writeAgentLogRecord);

  // 启动时把残留 running 标为 crashed / 愈合旧 interrupted
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

    // 广播前尽量补上 chatSessionId，便于 renderer 按会话路由
    const chatSessionId =
      event.chatSessionId?.trim() || getSessionByThreadId(event.threadId)?.id || undefined;
    const enriched = chatSessionId && !event.chatSessionId ? { ...event, chatSessionId } : event;

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.agentEvent, enriched);
    }

    try {
      if (enriched.type === "done") {
        setSessionRunStatus(enriched.threadId, "idle", {
          byThread: true,
          activeRunId: null,
          interruptReason: null,
        });
        broadcastThreadsChanged();
        flushPendingMcpReload(bridge);
      } else if (enriched.type === "error") {
        const cancelled = /cancel/i.test(enriched.error);
        const crashed = /utilityProcess exited|ready timeout|Process exited|EPIPE|\bcrash\b/i.test(
          enriched.error,
        );
        // 手动取消 → cancelled；进程异常 → crashed（可 Resume）；其它 → failed
        setSessionRunStatus(
          enriched.threadId,
          cancelled ? "cancelled" : crashed ? "crashed" : "failed",
          {
            byThread: true,
            activeRunId: null,
            interruptReason: cancelled ? "cancelled" : crashed ? "crash" : enriched.error,
          },
        );
        broadcastThreadsChanged();
        flushPendingMcpReload(bridge);
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
            sessionId: payload?.sessionId,
            threadId: payload?.threadId,
            history: payload?.history,
            traceId: payload?.traceId,
            workspaceRoot: payload?.workspaceRoot,
            workspaceName: payload?.workspaceName,
            contextPaths: payload?.contextPaths,
          };

    const admitted = admitRun({
      sessionId: command.sessionId,
      threadId: command.threadId,
      workspaceRoot: command.workspaceRoot,
      workspaceName: command.workspaceName,
    });
    if (!admitted.ok) {
      return { ok: false as const, error: admitted.error };
    }

    // 先解锁钥匙串，成功后再标 running / 派发；失败不发消息（弹窗在 renderer）
    const secretError = ensureModelSecretsUnlocked();
    if (secretError) {
      return { ok: false as const, error: secretError };
    }

    try {
      upsertSessionForRun({
        threadId: admitted.threadId,
        workspaceId: admitted.session.workspaceId,
        titleHint: command.message,
        runStatus: "running",
      });
    } catch {
      /* ignore */
    }

    return bridge.run({
      ...command,
      sessionId: admitted.session.id,
      threadId: admitted.threadId,
      workspaceRoot: admitted.workspaceRoot,
      workspaceName: admitted.workspaceName,
    });
  });

  ipcMain.handle(IpcChannels.agentCancel, async (_evt, payload?: AgentCancelCommand | string) => {
    const runId = typeof payload === "string" ? payload.trim() : (payload?.runId?.trim() ?? "");
    const sessionId = typeof payload === "string" ? undefined : payload?.sessionId?.trim();
    if (!runId) {
      // 禁止 cancel-all：必须带 runId
      return;
    }
    bridge.cancel(runId);
    const session = resolveSessionForCancel({ runId, sessionId });
    if (session) {
      setSessionRunStatus(session.id, "cancelled", {
        activeRunId: null,
        interruptReason: "cancelled",
      });
      broadcastThreadsChanged();
    }
  });

  ipcMain.handle(IpcChannels.agentHitlRespond, async (_evt, response: HitlResponse) => {
    respondHitl(response, bridge);
  });

  ipcMain.handle(IpcChannels.agentListThreads, async () => {
    return listThreads();
  });

  ipcMain.handle(IpcChannels.agentResume, async (_evt, command: AgentResumeCommand) => {
    const session = resolveSession(command.sessionId, command.threadId);
    if (!session) {
      return { ok: false as const, error: "Session not found for resume." };
    }
    const workspace = getWorkspace(session.workspaceId);
    let workspaceRoot: string | undefined;
    try {
      if (workspace?.rootPath) workspaceRoot = assertWorkspaceRoot(workspace.rootPath);
    } catch {
      workspaceRoot = undefined;
    }
    if (!workspaceRoot) {
      return {
        ok: false as const,
        error: "No workspace open. Open a workspace and start a chat before sending.",
      };
    }

    const secretError = ensureModelSecretsUnlocked();
    if (secretError) {
      return { ok: false as const, error: secretError };
    }

    const workspaceName = command.workspaceName?.trim() || workspace?.name;
    setSessionRunStatus(session.id, "running", {
      interruptReason: null,
    });
    broadcastThreadsChanged();
    return bridge.resume({
      ...command,
      sessionId: session.id,
      threadId: session.threadId,
      workspaceRoot,
      workspaceName,
    });
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

/** utility 退出时：把 running 标 crashed（有 checkpoint 可 Resume）。 */
export function onAgentUtilityExited(): void {
  try {
    if (healRunningSessions() > 0) broadcastThreadsChanged();
  } catch {
    /* ignore */
  }
}
