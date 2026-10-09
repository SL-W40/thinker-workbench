/**
 * Agent 运行相关 IPC：run / cancel / resume / listThreads，
 * 并将 utilityProcess 事件广播到所有窗口；同步 SQLite run_status。
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
import {
  assertWorkspaceRoot,
  getActiveSessionId,
  getActiveWorkspaceRoot,
  getSession,
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
import { broadcastThreadsChanged } from "./workspacesHandlers";

function broadcastLog(record: LogRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.logEvent, record);
  }
}

const NO_WORKSPACE_ERROR =
  "No workspace open. Open a workspace and start a chat before sending.";

/** 解析本轮工作区根：命令显式 > 活动会话所属工作空间。 */
function resolveWorkspaceRoot(explicit?: string): string | undefined {
  if (explicit?.trim()) {
    try {
      return assertWorkspaceRoot(explicit.trim());
    } catch {
      return undefined;
    }
  }
  return getActiveWorkspaceRoot() ?? undefined;
}

/** 活动会话所属工作区显示名。 */
function resolveWorkspaceName(): string | undefined {
  const sid = getActiveSessionId();
  const session = sid ? getSession(sid) : null;
  if (!session?.workspaceId) return undefined;
  return getWorkspace(session.workspaceId)?.name;
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
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.agentEvent, event);
    }

    try {
      if (event.type === "done") {
        setSessionRunStatus(event.threadId, "idle", {
          byThread: true,
          activeRunId: null,
          interruptReason: null,
        });
        broadcastThreadsChanged();
      } else if (event.type === "error") {
        const cancelled = /cancel/i.test(event.error);
        const crashed =
          /utilityProcess exited|ready timeout|Process exited|EPIPE|\bcrash\b/i.test(
            event.error,
          );
        // 手动取消 → cancelled；进程异常 → crashed（可 Resume）；其它 → failed
        setSessionRunStatus(
          event.threadId,
          cancelled ? "cancelled" : crashed ? "crashed" : "failed",
          {
            byThread: true,
            activeRunId: null,
            interruptReason: cancelled
              ? "cancelled"
              : crashed
                ? "crash"
                : event.error,
          },
        );
        broadcastThreadsChanged();
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
            threadId: payload?.threadId,
            history: payload?.history,
            traceId: payload?.traceId,
            workspaceRoot: payload?.workspaceRoot,
            workspaceName: payload?.workspaceName,
          };

    const workspaceRoot = resolveWorkspaceRoot(command.workspaceRoot);
    if (!workspaceRoot) {
      return { ok: false as const, error: NO_WORKSPACE_ERROR };
    }
    const workspaceName = command.workspaceName?.trim() || resolveWorkspaceName();
    const activeSessionId = getActiveSessionId();
    const activeSession = activeSessionId ? getSession(activeSessionId) : null;
    const threadId = command.threadId?.trim() || activeSession?.threadId;
    const workspaceId = activeSession?.workspaceId;

    // 若尚无会话且有活动工作空间，先 upsert 占位以便落库 run_status
    if (threadId && workspaceId) {
      try {
        upsertSessionForRun({
          threadId,
          workspaceId,
          titleHint: command.message,
          runStatus: "running",
        });
      } catch {
        /* ignore */
      }
    }

    return bridge.run({
      ...command,
      threadId,
      workspaceRoot,
      workspaceName,
    });
  });

  ipcMain.handle(IpcChannels.agentCancel, async (_evt, payload?: AgentCancelCommand | string) => {
    const runId = typeof payload === "string" ? payload : payload?.runId;
    bridge.cancel(runId?.trim() ? runId : undefined);
    // 取消保留 checkpoint，标 cancelled，供时间线「继续」
    const activeId = getActiveSessionId();
    const session = activeId ? getSession(activeId) : null;
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
    const workspaceRoot = resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return { ok: false as const, error: NO_WORKSPACE_ERROR };
    }
    const workspaceName = command.workspaceName?.trim() || resolveWorkspaceName();
    const session = getSessionByThreadId(command.threadId);
    if (session) {
      setSessionRunStatus(session.id, "running", {
        interruptReason: null,
      });
      broadcastThreadsChanged();
    }
    return bridge.resume({
      ...command,
      workspaceRoot,
      workspaceName,
    });
  });

  ipcMain.handle(IpcChannels.contextUsage, async (_evt, payload?: ContextUsageRequest) => {
    const request: ContextUsageRequest = {
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
      workspaceRoot: resolveWorkspaceRoot(payload?.workspaceRoot),
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
