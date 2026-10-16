/**
 * Trace span 写入入口：截断 → jsonl → SQLite 索引。
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
  bumpRun?: boolean;
};

/** 开关关闭时仍返回 id，便于调用方配对 end。 */
function enabled(): boolean {
  try {
    return getGeneralSettings().observabilityEnabled !== false;
  } catch {
    return true;
  }
}

/** 开始 span；返回 spanId（关闭采集时仍返回 id，便于调用方配对 end）。 */
export function startTraceSpan(input: StartSpanInput): string {
  const spanId = input.spanId?.trim() || createSpanId();
  if (!enabled()) return spanId;
  if (!input.sessionId.trim()) return spanId;
  // 聊天已删：忽略迟到写入，避免 Trace 会话「删了又回来」
  if (isSessionArtifactsPurged(input.sessionId)) return spanId;

  const limits = limitsFromGeneral();
  const startTs = input.startTs ?? Date.now();
  const attrs = {
    ...(input.attrs ?? {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };

  upsertSession({
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    title: input.title,
    ts: startTs,
    bumpRun: input.bumpRun,
  });

  let inputRef: string | undefined;
  if (input.input !== undefined) {
    const cut = truncateForTrace(input.input, limits);
    inputRef = appendPayload(input.sessionId, {
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
    sessionId: input.sessionId,
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
  insertSpanStart(record);
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
  if (!spanId.trim()) return;

  const prev = getSpan(spanId);
  const sessionId = patch.sessionId ?? prev?.sessionId;
  if (!sessionId) return;
  if (isSessionArtifactsPurged(sessionId)) return;

  const limits = limitsFromGeneral();
  const endTs = patch.endTs ?? Date.now();
  let outputRef: string | undefined;

  if (patch.error !== undefined) {
    const cut = truncateForTrace(patch.error, limits);
    outputRef = appendPayload(sessionId, {
      runId: spanId,
      side: "err",
      ts: endTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  } else if (patch.output !== undefined) {
    const cut = truncateForTrace(patch.output, limits);
    outputRef = appendPayload(sessionId, {
      runId: spanId,
      side: "out",
      ts: endTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  }

  updateSpanEnd(spanId, {
    status: patch.status ?? (patch.error !== undefined ? "error" : "ok"),
    summary: patch.summary,
    endTs,
    outputRef,
    attrs: patch.attrs,
  });
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
