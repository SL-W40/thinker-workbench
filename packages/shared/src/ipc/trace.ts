/**
 * 本机 Trace：会话 run 树、载荷与 preload API。
 */

export {
  DEFAULT_TRACE_MAX_FIELD_BYTES,
  DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
  DEFAULT_TRACE_MAX_MESSAGE_CHARS,
  DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
  DEFAULT_TRACE_MAX_SESSIONS,
  DEFAULT_TRACE_MAX_TOTAL_BYTES,
  DEFAULT_TRACE_REDACT_KEYS,
  DEFAULT_TRACE_RETENTION_DAYS,
} from "./obsLimits";

export type TraceSource = "app" | "desktop" | "agent";

/** run 节点类型：chain / llm / tool 等。 */
export type TraceRunType =
  | "chain"
  | "llm"
  | "tool"
  | "retriever"
  | "embedding"
  | "prompt"
  | "parser"
  | "memory";

export const TRACE_RUN_TYPES = [
  "chain",
  "llm",
  "tool",
  "retriever",
  "embedding",
  "prompt",
  "parser",
  "memory",
] as const;

export function normalizeTraceRunType(
  value: unknown,
  fallback: TraceRunType = "chain",
): TraceRunType {
  return typeof value === "string" && (TRACE_RUN_TYPES as readonly string[]).includes(value)
    ? (value as TraceRunType)
    : fallback;
}

export type TraceSpanStatus = "ok" | "error" | "cancelled" | "running";
export type TraceCaptureBinary = "meta" | "omit";
export type TracePayloadSide = "in" | "out" | "err";

/** 本机 Trace 树上的一条 run。 */
export type TraceSpanRecord = {
  id: string;
  sessionId: string;
  agentRunId?: string;
  traceId?: string;
  parentId?: string;
  taskId?: string;
  name: string;
  runType: TraceRunType;
  source: TraceSource;
  status?: TraceSpanStatus;
  startTs: number;
  endTs?: number;
  summary?: string;
  inputRef?: string;
  outputRef?: string;
  attrs?: Record<string, unknown>;
};

export type TracePayloadRecord = {
  id: string;
  /** 所属 Trace run 节点 id（TraceSpanRecord.id）。 */
  runId: string;
  side: TracePayloadSide;
  ts: number;
  bytes: number;
  truncated: boolean;
  json: unknown;
};

export type TraceSessionSummary = {
  sessionId: string;
  workspaceId?: string;
  threadId?: string;
  title?: string;
  firstTs: number;
  lastTs: number;
  runCount: number;
};

export type TraceSpanStartMessage = {
  channel: "utility";
  kind: "span";
  phase: "start";
  span: Omit<TraceSpanRecord, "endTs" | "inputRef" | "outputRef" | "status"> & {
    status?: TraceSpanStatus;
    input?: unknown;
  };
};

export type TraceSpanEndMessage = {
  channel: "utility";
  kind: "span";
  phase: "end";
  spanId: string;
  status?: TraceSpanStatus;
  summary?: string;
  output?: unknown;
  error?: unknown;
  attrs?: Record<string, unknown>;
  endTs?: number;
};

export type TraceSpanMessage = TraceSpanStartMessage | TraceSpanEndMessage;

export type TraceStartSpanRequest = {
  spanId?: string;
  sessionId: string;
  agentRunId?: string;
  traceId?: string;
  parentId?: string;
  taskId?: string;
  name: string;
  runType: TraceRunType;
  source?: TraceSource;
  summary?: string;
  attrs?: Record<string, unknown>;
  input?: unknown;
  startTs?: number;
};

export type TraceEndSpanRequest = {
  spanId: string;
  status?: TraceSpanStatus;
  summary?: string;
  output?: unknown;
  error?: unknown;
  attrs?: Record<string, unknown>;
  endTs?: number;
};

export type TraceListSessionsQuery = {
  workspaceId?: string;
  q?: string;
  limit?: number;
};

/** 下发给 engine：Trace 采集开关。 */
export type TraceSettings = {
  enabled: boolean;
};

export const DEFAULT_TRACE_SETTINGS: TraceSettings = {
  enabled: true,
};

export function normalizeTraceSettings(raw: unknown): TraceSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRACE_SETTINGS };
  const o = raw as { enabled?: unknown };
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : true,
  };
}

export type ThinkerTraceApi = {
  listSessions(query?: TraceListSessionsQuery): Promise<TraceSessionSummary[]>;
  getSessionSpans(sessionId: string): Promise<TraceSpanRecord[]>;
  getPayload(sessionId: string, payloadId: string): Promise<TracePayloadRecord | null>;
  startSpan(req: TraceStartSpanRequest): Promise<{ spanId: string }>;
  endSpan(req: TraceEndSpanRequest): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  exportSession(
    sessionId: string,
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
};
