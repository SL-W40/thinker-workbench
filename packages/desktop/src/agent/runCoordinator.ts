/**
 * Run 准入协调：同 thread 互斥与工作区根校验；不负责执行本身。
 * 并行槽与 FIFO 由 RunLedger 决定。activeSessionId 仅 UI 焦点，不参与所有权判断。
 */
import {
  type ChatSessionRecord,
  DEFAULT_MAX_PARALLEL_RUNS,
  DEFAULT_MAX_QUEUED_RUNS,
  DEFAULT_QUEUE_TIMEOUT_MIN,
  normalizeMaxParallelRuns,
  normalizeMaxQueuedRuns,
  normalizeQueueTimeoutMin,
} from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";
import {
  assertWorkspaceRoot,
  getSession,
  getSessionByActiveRunId,
  getSessionByThreadId,
  getWorkspace,
} from "../db/workspacesStore";

/** 读取当前生效的并行上限。 */
export function getMaxParallelRuns(): number {
  try {
    return normalizeMaxParallelRuns(getGeneralSettings().maxParallelRuns);
  } catch {
    return DEFAULT_MAX_PARALLEL_RUNS;
  }
}

/** 读取等待队列深度。0 表示超限直接拒绝。 */
export function getMaxQueuedRuns(): number {
  try {
    return normalizeMaxQueuedRuns(getGeneralSettings().maxQueuedRuns);
  } catch {
    return DEFAULT_MAX_QUEUED_RUNS;
  }
}

/** 读取排队超时（分钟）。0 表示不超时。 */
export function getQueueTimeoutMin(): number {
  try {
    return normalizeQueueTimeoutMin(getGeneralSettings().queueTimeoutMin);
  } catch {
    return DEFAULT_QUEUE_TIMEOUT_MIN;
  }
}

export type AdmitRunRequest = {
  sessionId?: string;
  threadId?: string;
  /** 显示名覆盖；根路径一律由 session.workspaceId → workspace.rootPath 解析。 */
  workspaceName?: string;
};

export type AdmitRunOk = {
  ok: true;
  session: ChatSessionRecord;
  threadId: string;
  workspaceRoot: string;
  workspaceName?: string;
};

export type AdmitRunErr = {
  ok: false;
  error: string;
};

export type AdmitRunResult = AdmitRunOk | AdmitRunErr;

export const NO_SESSION = "No chat session. Create or select a session before sending.";
export const NO_WORKSPACE = "No workspace open. Open a workspace and start a chat before sending.";
export const THREAD_BUSY = "This session already has a running agent. Stop it or wait.";

/** 并行槽已满且不允许排队时的拒绝文案。 */
export function parallelCapError(max: number): string {
  return `Too many parallel sessions (max ${max}). Stop one before starting another.`;
}

/** 等待队列已满。 */
export function queueFullError(max: number): string {
  return `Too many queued sessions (max ${max}). Stop a queued session or wait.`;
}

/** 排队等待超时。 */
export function queueTimeoutError(minutes: number): string {
  return `Queued run timed out after ${minutes} minutes.`;
}

/**
 * 解析并校验一次 run 的归属与资源；通过后返回规范化上下文。
 * 不修改 DB——调用方在 bridge 真正派发前再 upsert running。
 */
export function admitRun(request: AdmitRunRequest): AdmitRunResult {
  const session = resolveSession(request.sessionId, request.threadId);
  if (!session) {
    return { ok: false, error: NO_SESSION };
  }

  // queued 与 running 一样占着这条会话，不能再叠一条
  if ((session.runStatus === "running" || session.runStatus === "queued") && session.activeRunId) {
    return { ok: false, error: THREAD_BUSY };
  }

  const workspace = getWorkspace(session.workspaceId);
  if (!workspace?.rootPath?.trim()) {
    return { ok: false, error: NO_WORKSPACE };
  }

  // 只信登记根：不接受请求里自带的路径（即使目录存在）。
  let workspaceRoot: string;
  try {
    workspaceRoot = assertWorkspaceRoot(workspace.rootPath);
  } catch {
    return { ok: false, error: NO_WORKSPACE };
  }

  const workspaceName = request.workspaceName?.trim() || workspace.name || undefined;

  return {
    ok: true,
    session,
    threadId: request.threadId?.trim() || session.threadId,
    workspaceRoot,
    workspaceName,
  };
}

/** 按 sessionId 或 threadId 解析会话（优先 sessionId）。 */
export function resolveSession(sessionId?: string, threadId?: string): ChatSessionRecord | null {
  const sid = sessionId?.trim();
  if (sid) {
    const byId = getSession(sid);
    if (byId) return byId;
  }
  const tid = threadId?.trim();
  if (tid) return getSessionByThreadId(tid);
  return null;
}

/** 供 cancel：优先 sessionId，其次 runId→session，再次 threadId。 */
export function resolveSessionForCancel(options: {
  runId: string;
  sessionId?: string;
  threadId?: string;
}): ChatSessionRecord | null {
  const bySession = resolveSession(options.sessionId, options.threadId);
  if (bySession) return bySession;
  return getSessionByActiveRunId(options.runId);
}
