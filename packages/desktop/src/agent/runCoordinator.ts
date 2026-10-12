/**
 * Run 准入协调：同 thread 互斥、并行上限；不负责执行本身。
 * activeSessionId 仅 UI 焦点，不参与所有权判断。
 * 并行上限读自 GeneralSettings.maxParallelRuns。
 */
import {
  DEFAULT_MAX_PARALLEL_RUNS,
  normalizeMaxParallelRuns,
  type ChatSessionRecord,
} from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";
import {
  assertWorkspaceRoot,
  countRunningSessions,
  getSession,
  getSessionByActiveRunId,
  getSessionByThreadId,
  getWorkspace,
} from "../db/workspacesStore";

/** @deprecated 使用 getMaxParallelRuns() / settings.maxParallelRuns；保留别名便于测试引用默认值。 */
export const MAX_PARALLEL_RUNS = DEFAULT_MAX_PARALLEL_RUNS;

/** 读取当前生效的并行上限。 */
export function getMaxParallelRuns(): number {
  try {
    return normalizeMaxParallelRuns(getGeneralSettings().maxParallelRuns);
  } catch {
    return DEFAULT_MAX_PARALLEL_RUNS;
  }
}

export type AdmitRunRequest = {
  sessionId?: string;
  threadId?: string;
  /** 命令显式工作区根；缺省由 session → workspace 解析。 */
  workspaceRoot?: string;
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

const NO_SESSION = "No chat session. Create or select a session before sending.";
const NO_WORKSPACE =
  "No workspace open. Open a workspace and start a chat before sending.";
const THREAD_BUSY = "This session already has a running agent. Stop it or wait.";

function parallelLimitError(max: number): string {
  return `Too many parallel sessions (max ${max}). Stop one before starting another.`;
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

  if (session.runStatus === "running" && session.activeRunId) {
    return { ok: false, error: THREAD_BUSY };
  }

  const maxParallel = getMaxParallelRuns();
  // 本会话尚未标 running 时计入其它会话；本会话重入已在上方拒绝
  const running = countRunningSessions();
  const selfAlreadyCounted = session.runStatus === "running" ? 1 : 0;
  if (running - selfAlreadyCounted >= maxParallel) {
    return { ok: false, error: parallelLimitError(maxParallel) };
  }

  const workspace = getWorkspace(session.workspaceId);
  if (!workspace?.rootPath?.trim()) {
    return { ok: false, error: NO_WORKSPACE };
  }

  let workspaceRoot: string;
  try {
    workspaceRoot = request.workspaceRoot?.trim()
      ? assertWorkspaceRoot(request.workspaceRoot.trim())
      : assertWorkspaceRoot(workspace.rootPath);
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
export function resolveSession(
  sessionId?: string,
  threadId?: string,
): ChatSessionRecord | null {
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
