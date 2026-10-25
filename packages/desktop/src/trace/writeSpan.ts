/**
 * Trace span 写入入口：截断 → jsonl → SQLite 索引。
 *
 * workspaceId 必填：Trace 落在所属工作区的库里。
 * 拿不到归属（会话尚未登记 / 已删）时跳过写入并告警，不落无归属数据。
 */
import {
  createSpanId,
  type TraceEndSpanRequest,
  type TraceRunType,
  type TraceSource,
  type TraceSpanRecord,
  type TraceSpanStatus,
  type TraceStartSpanRequest,
} from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";
import { isSessionArtifactsPurged } from "../db/sessionArtifacts";
import { appendPayload } from "./sessionJsonl";
import { getSpan, insertSpanStart, updateSpanEnd, upsertSession } from "./traceDb";
import { limitsFromGeneral, truncateForTrace } from "./truncate";
import { resolveWorkspaceIdForSession } from "./workspaceTraceDb";

export type StartSpanInput = {
  spanId?: string;
  sessionId: string;
  agentRunId?: string;
  traceId?: string;
  parentId?: string;
  taskId?: string;
  name: string;
  runType: TraceRunType;
  source: TraceSource;
  summary?: string;
  attrs?: Record<string, unknown>;
  input?: unknown;
  startTs?: number;
  workspaceId?: string;
  threadId?: string;
  title?: string;
};

/** spanId → 所属工作区：end 阶段按 spanId 反查（会话索引已不可用时仍能配对）。 */
const spanWorkspace = new Map<string, string>();

/** 开关关闭时仍返回 id，便于调用方配对 end。 */
function enabled(): boolean {
  try {
    return getGeneralSettings().observabilityEnabled !== false;
  } catch {
    return true;
  }
}

/** 解析 span 归属工作区；拿不到则告警并返回 null。 */
function resolveWorkspace(sessionId: string, hint?: string): string | null {
  const direct = hint?.trim();
  if (direct) return direct;
  const fromIndex = resolveWorkspaceIdForSession(sessionId);
  if (fromIndex) return fromIndex;
  console.warn(`[trace] workspaceId unknown, span dropped for session ${sessionId}`);
  return null;
}

/** 开始 span；返回 spanId（关闭采集或无归属时仍返回 id，便于调用方配对 end）。 */
export function startTraceSpan(input: StartSpanInput): string {
  const spanId = input.spanId?.trim() || createSpanId();
  if (!enabled()) return spanId;
  const sessionId = input.sessionId.trim();
  if (!sessionId) return spanId;
  // 聊天已删：忽略迟到写入，避免 Trace 会话「删了又回来」
  if (isSessionArtifactsPurged(sessionId)) return spanId;

  const workspaceId = resolveWorkspace(sessionId, input.workspaceId);
  if (!workspaceId) return spanId;
  spanWorkspace.set(spanId, workspaceId);

  const limits = limitsFromGeneral();
  const startTs = input.startTs ?? Date.now();
  const attrs = {
    ...(input.attrs ?? {}),
    workspaceId,
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };

  upsertSession(workspaceId, {
    sessionId,
    threadId: input.threadId,
    title: input.title,
    ts: startTs,
  });

  let inputRef: string | undefined;
  if (input.input !== undefined) {
    const cut = truncateForTrace(input.input, limits);
    inputRef = appendPayload(workspaceId, sessionId, {
      runId: spanId,
      side: "in",
      ts: startTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  }

  // 缺 summary 时用 name 生成短展示文案（时序图 / 列表标签）
  const summary =
    input.summary?.trim() || (input.name.length > 48 ? `${input.name.slice(0, 46)}…` : input.name);

  const record: TraceSpanRecord = {
    id: spanId,
    sessionId,
    agentRunId: input.agentRunId,
    traceId: input.traceId,
    parentId: input.parentId,
    taskId: input.taskId,
    name: input.name,
    runType: input.runType,
    source: input.source,
    status: "running",
    startTs,
    summary,
    inputRef,
    attrs: Object.keys(attrs).length ? attrs : undefined,
  };
  insertSpanStart(workspaceId, record);
  return spanId;
}

export function endTraceSpan(
  spanId: string,
  patch: {
    sessionId?: string;
    status?: TraceSpanStatus;
    summary?: string;
    output?: unknown;
    error?: unknown;
    attrs?: Record<string, unknown>;
    endTs?: number;
  },
): void {
  if (!enabled()) return;
  const id = spanId.trim();
  if (!id) return;

  const known = spanWorkspace.get(id);
  const workspaceId =
    known ?? (patch.sessionId ? resolveWorkspaceIdForSession(patch.sessionId) : null) ?? null;
  if (!workspaceId) {
    console.warn(`[trace] workspaceId unknown, span end dropped for ${id}`);
    return;
  }

  const prev = getSpan(workspaceId, id);
  const targetSessionId = patch.sessionId ?? prev?.sessionId;
  if (!targetSessionId) return;
  if (isSessionArtifactsPurged(targetSessionId)) {
    spanWorkspace.delete(id);
    return;
  }

  const limits = limitsFromGeneral();
  const endTs = patch.endTs ?? Date.now();
  let outputRef: string | undefined;

  if (patch.error !== undefined) {
    const cut = truncateForTrace(patch.error, limits);
    outputRef = appendPayload(workspaceId, targetSessionId, {
      runId: id,
      side: "err",
      ts: endTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  } else if (patch.output !== undefined) {
    const cut = truncateForTrace(patch.output, limits);
    outputRef = appendPayload(workspaceId, targetSessionId, {
      runId: id,
      side: "out",
      ts: endTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  }

  updateSpanEnd(workspaceId, id, {
    status: patch.status ?? (patch.error !== undefined ? "error" : "ok"),
    summary: patch.summary,
    endTs,
    outputRef,
    attrs: patch.attrs,
  });
  spanWorkspace.delete(id);
}

/** IPC：renderer start。 */
export function handleStartSpan(req: TraceStartSpanRequest): { spanId: string } {
  const spanId = startTraceSpan({
    ...req,
    source: req.source ?? "app",
    workspaceId: typeof req.attrs?.workspaceId === "string" ? req.attrs.workspaceId : undefined,
    threadId: typeof req.attrs?.threadId === "string" ? req.attrs.threadId : undefined,
  });
  return { spanId };
}

/** IPC：renderer end。 */
export function handleEndSpan(req: TraceEndSpanRequest): void {
  endTraceSpan(req.spanId, req);
}
