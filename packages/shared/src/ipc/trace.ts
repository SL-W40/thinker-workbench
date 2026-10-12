/**
 * 会话 Trace：跨进程 Span / Payload 协议与查询 API。
 */

/** 产生 span 的进程角色。 */
export type TraceSource = "app" | "desktop" | "agent";

/** Span 语义类别。 */
export type TraceSpanKind =
  | "ipc"
  | "model"
  | "tool"
  | "graph"
  | "subagent"
  | "browser"
  | "pty"
  | "hitl"
  | "other";

/** Span 终态。 */
export type TraceSpanStatus = "ok" | "error" | "cancelled" | "running";

/** 二进制载荷策略。 */
export type TraceCaptureBinary = "meta" | "omit";

/** Payload 侧。 */
export type TracePayloadSide = "in" | "out" | "err";

/** 索引层 Span（不含大 JSON）。 */
export type TraceSpanRecord = {
  spanId: string;
  sessionId: string;
  runId?: string;
  traceId?: string;
  parentSpanId?: string;
  taskId?: string;
  name: string;
  kind: TraceSpanKind;
  source: TraceSource;
  status?: TraceSpanStatus;
  startTs: number;
  endTs?: number;
  summary?: string;
  inputRef?: string;
  outputRef?: string;
  attrs?: Record<string, unknown>;
};

/** JSONL 中的一条载荷。 */
export type TracePayloadRecord = {
  id: string;
  spanId: string;
  side: TracePayloadSide;
  ts: number;
  bytes: number;
  truncated: boolean;
  json: unknown;
};

/** 会话列表行。 */
export type TraceSessionSummary = {
  sessionId: string;
  workspaceId?: string;
  threadId?: string;
  title?: string;
  firstTs: number;
  lastTs: number;
  runCount: number;
};

/** agent → main：开始一个 span。 */
export type TraceSpanStartMessage = {
  channel: "utility";
  kind: "span";
  phase: "start";
  span: Omit<TraceSpanRecord, "endTs" | "inputRef" | "outputRef" | "status"> & {
    status?: TraceSpanStatus;
    input?: unknown;
  };
};

/** agent → main：结束一个 span。 */
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

/** renderer → main：开始 span（经 IPC）。 */
export type TraceStartSpanRequest = {
  spanId?: string;
  sessionId: string;
  runId?: string;
  traceId?: string;
  parentSpanId?: string;
  taskId?: string;
  name: string;
  kind: TraceSpanKind;
  source?: TraceSource;
  summary?: string;
  attrs?: Record<string, unknown>;
  input?: unknown;
  startTs?: number;
};

/** renderer → main：结束 span。 */
export type TraceEndSpanRequest = {
  spanId: string;
  status?: TraceSpanStatus;
  summary?: string;
  output?: unknown;
  error?: unknown;
  attrs?: Record<string, unknown>;
  endTs?: number;
};

/** 列出会话。 */
export type TraceListSessionsQuery = {
  workspaceId?: string;
  q?: string;
  limit?: number;
};

/** Preload Trace API。 */
export type ThinkerTraceApi = {
  listSessions(query?: TraceListSessionsQuery): Promise<TraceSessionSummary[]>;
  getSessionSpans(sessionId: string): Promise<TraceSpanRecord[]>;
  getPayload(sessionId: string, payloadId: string): Promise<TracePayloadRecord | null>;
  startSpan(req: TraceStartSpanRequest): Promise<{ spanId: string }>;
  endSpan(req: TraceEndSpanRequest): Promise<void>;
  /** 删除会话 Trace（索引 + jsonl）；不删聊天会话本身。 */
  deleteSession(sessionId: string): Promise<void>;
  /**
   * 导出会话排查 ZIP（spans / payloads / chat / manifest）。
   * 成功返回保存路径；用户取消时 `error` 为 `"cancelled"`。
   */
  exportSession(
    sessionId: string,
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
};

/** 默认脱敏 key。 */
export const DEFAULT_TRACE_REDACT_KEYS = [
  "authorization",
  "apiKey",
  "api_key",
  "token",
  "password",
  "secret",
] as const;

export const DEFAULT_TRACE_MAX_FIELD_BYTES = 262_144;
export const DEFAULT_TRACE_MAX_PAYLOAD_BYTES = 1_048_576;
export const DEFAULT_TRACE_MAX_MESSAGE_CHARS = 100_000;
export const DEFAULT_TRACE_MAX_HISTORY_MESSAGES = 200;
export const DEFAULT_TRACE_MAX_SESSIONS = 200;
export const DEFAULT_TRACE_MAX_TOTAL_BYTES = 5_368_709_120;
export const DEFAULT_TRACE_RETENTION_DAYS = 30;
