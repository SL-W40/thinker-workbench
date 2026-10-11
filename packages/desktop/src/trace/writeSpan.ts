/**
 * Trace span 写入入口：截断 → jsonl → SQLite 索引。
 */
import {
  createSpanId,
  type TraceEndSpanRequest,
  type TraceSpanKind,
  type TraceSpanRecord,
  type TraceSource,
  type TraceStartSpanRequest,
  type TraceSpanStatus,
} from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";
import { appendPayload } from "./sessionJsonl";
import { getSpan, insertSpanStart, updateSpanEnd, upsertSession } from "./traceDb";
import { limitsFromGeneral, truncateForTrace } from "./truncate";

export type StartSpanInput = {
  spanId?: string;
  sessionId: string;
  runId?: string;
  traceId?: string;
  parentSpanId?: string;
  taskId?: string;
  name: string;
  kind: TraceSpanKind;
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

function enabled(): boolean {
  try {
    return getGeneralSettings().traceEnabled;
  } catch {
    return true;
  }
}

/** 开始 span；返回 spanId（关闭采集时仍返回 id，便于调用方配对 end）。 */
export function startTraceSpan(input: StartSpanInput): string {
  const spanId = input.spanId?.trim() || createSpanId();
  if (!enabled()) return spanId;
  if (!input.sessionId.trim()) return spanId;

  const limits = limitsFromGeneral(getGeneralSettings());
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
      spanId,
      side: "in",
      ts: startTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  }

  // 缺 summary 时用 name 生成短展示文案（时序图 / 列表标签）
  const summary =
    input.summary?.trim() ||
    (input.name.length > 48 ? `${input.name.slice(0, 46)}…` : input.name);

  const record: TraceSpanRecord = {
    spanId,
    sessionId: input.sessionId,
    runId: input.runId,
    traceId: input.traceId,
    parentSpanId: input.parentSpanId,
    taskId: input.taskId,
    name: input.name,
    kind: input.kind,
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

  const limits = limitsFromGeneral(getGeneralSettings());
  const endTs = patch.endTs ?? Date.now();
  let outputRef: string | undefined;

  if (patch.error !== undefined) {
    const cut = truncateForTrace(patch.error, limits);
    outputRef = appendPayload(sessionId, {
      spanId,
      side: "err",
      ts: endTs,
      bytes: cut.bytes,
      truncated: cut.truncated,
      json: cut.value,
    });
  } else if (patch.output !== undefined) {
    const cut = truncateForTrace(patch.output, limits);
    outputRef = appendPayload(sessionId, {
      spanId,
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
    workspaceId:
      typeof req.attrs?.workspaceId === "string" ? req.attrs.workspaceId : undefined,
    threadId: typeof req.attrs?.threadId === "string" ? req.attrs.threadId : undefined,
  });
  return { spanId };
}

/** IPC：renderer end。 */
export function handleEndSpan(req: TraceEndSpanRequest): void {
  endTraceSpan(req.spanId, req);
}
