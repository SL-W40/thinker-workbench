/**
 * 消息持久化（chat.db chat_messages 表）。
 */
import {
  type ChatMessage,
  type ChatPlanTodo,
  type ChatSessionRecord,
  isPlanStatus,
  sanitizeUsage,
} from "@thinker-workbench/shared";
import { indexSessionMessages, type SearchIndexRow } from "../messagesSearch";
import { activityAtFromMessages } from "../sessionActivity";
import { chatDb, type MsgRow } from "./db";
import { getSession } from "./sessions";

/** 回读落库的计划结构；不合法则丢弃，避免脏数据污染展示。 */
export function readPlan(value: unknown): ChatMessage["plan"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    todos?: unknown;
    markdown?: unknown;
  };
  if (typeof raw.id !== "string" || !raw.id.trim()) return undefined;
  if (!isPlanStatus(raw.status)) return undefined;
  return {
    id: raw.id,
    ...(typeof raw.title === "string" && raw.title.trim() ? { title: raw.title } : {}),
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description }
      : {}),
    status: raw.status,
    todos: Array.isArray(raw.todos) ? (raw.todos as ChatPlanTodo[]) : [],
    markdown: typeof raw.markdown === "string" ? raw.markdown : "",
  };
}

export function saveMessagesToDb(
  workspaceId: string,
  sessionId: string,
  messages: ChatMessage[],
): void {
  const db = chatDb(workspaceId);
  const del = db.prepare("DELETE FROM chat_messages WHERE session_id = ?");
  const ins = db.prepare(
    `INSERT INTO chat_messages(id, session_id, role, text, created_at, pending, payload_json, seq)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  const sessionRow = db
    .prepare("SELECT created_at FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { created_at: number } | undefined;
  const fallback = sessionRow?.created_at ?? now;
  const activityAt = activityAtFromMessages(messages, fallback);
  // 与消息同批重建检索索引（先删后插，保证索引与表行一致）
  const indexRows: SearchIndexRow[] = [];
  const tx = db.transaction(() => {
    del.run(sessionId);
    for (let seq = 0; seq < messages.length; seq++) {
      const m = messages[seq];
      if (!m) continue;
      // 落库前冻结思考耗时：有 durationMs 则丢掉 startedAt，避免下次 hydrate 按墙钟重算
      const timeline = m.timeline?.map((step) => {
        if (step.kind !== "status" || step.status !== "thinking") return step;
        if (step.durationMs == null) {
          return { ...step, active: false, startedAt: undefined };
        }
        return { ...step, active: false, startedAt: undefined, durationMs: step.durationMs };
      });
      const images =
        Array.isArray(m.images) && m.images.length > 0
          ? m.images.filter(
              (img) =>
                img &&
                typeof img.id === "string" &&
                typeof img.path === "string" &&
                typeof img.mime === "string",
            )
          : undefined;
      const hasPayload =
        timeline ||
        m.pending ||
        m.usage ||
        m.usageEstimated ||
        m.durationMs != null ||
        m.runStartedAt != null ||
        Boolean(m.traceId) ||
        Boolean(images?.length) ||
        Boolean(m.plan);
      const payload = hasPayload
        ? JSON.stringify({
            timeline,
            pending: m.pending,
            usage: m.usage,
            usageEstimated: m.usageEstimated,
            durationMs: m.durationMs,
            // 已结束消息不持久化 live 计时锚点
            runStartedAt: m.pending ? m.runStartedAt : undefined,
            traceId: m.traceId,
            ...(images?.length ? { images } : {}),
            // 计划随消息落库（不写工作空间），重启后随会话恢复
            ...(m.plan ? { plan: m.plan } : {}),
          })
        : null;
      ins.run(m.id, sessionId, m.role, m.text, m.createdAt ?? now, m.pending ? 1 : 0, payload, seq);
      const idx = indexRows.length;
      indexRows[idx] = {
        seq,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt ?? now,
      };
    }
    db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(activityAt, sessionId);
  });
  tx();
  indexSessionMessages(db, sessionId, indexRows);
}

export function saveMessages(sessionId: string, messages: ChatMessage[]): void {
  const session = getSession(sessionId);
  // 会话已删（侧栏删除 / 切空间竞态）：幂等忽略，避免 IPC 抛 Session not found
  if (!session) return;
  saveMessagesToDb(session.workspaceId, sessionId, messages);
}

export function loadMessages(sessionId: string): ChatMessage[] {
  const session = getSession(sessionId);
  if (!session) return [];
  const rows = chatDb(session.workspaceId)
    .prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY seq ASC, created_at ASC")
    .all(sessionId) as MsgRow[];
  return rows.map((row) => {
    let timeline: ChatMessage["timeline"];
    let pending = row.pending === 1;
    let usage: ChatMessage["usage"];
    let usageEstimated: boolean | undefined;
    let durationMs: number | undefined;
    let runStartedAt: number | undefined;
    let traceId: string | undefined;
    let images: ChatMessage["images"];
    let plan: ChatMessage["plan"];
    if (row.payload_json) {
      try {
        const parsed = JSON.parse(row.payload_json) as {
          timeline?: ChatMessage["timeline"];
          pending?: boolean;
          usage?: ChatMessage["usage"];
          usageEstimated?: boolean;
          durationMs?: number;
          runStartedAt?: number;
          traceId?: string;
          images?: ChatMessage["images"];
          plan?: unknown;
        };
        timeline = parsed.timeline;
        if (typeof parsed.pending === "boolean") pending = parsed.pending;
        // 历史脏数据（非对象 / NaN / 负数）统一清洗，避免污染展示与累加
        const clean = sanitizeUsage(parsed.usage);
        if (clean) usage = clean;
        if (typeof parsed.usageEstimated === "boolean") {
          usageEstimated = parsed.usageEstimated;
        }
        if (typeof parsed.durationMs === "number") durationMs = parsed.durationMs;
        if (typeof parsed.runStartedAt === "number") runStartedAt = parsed.runStartedAt;
        if (typeof parsed.traceId === "string" && parsed.traceId.trim()) {
          traceId = parsed.traceId.trim();
        }
        if (Array.isArray(parsed.images) && parsed.images.length > 0) {
          images = parsed.images;
        }
        plan = readPlan(parsed.plan);
      } catch {
        /* ignore */
      }
    }
    return {
      id: row.id,
      role: row.role as ChatMessage["role"],
      text: row.text,
      createdAt: row.created_at,
      pending: pending || undefined,
      timeline,
      usage,
      usageEstimated,
      durationMs,
      runStartedAt,
      traceId,
      ...(images?.length ? { images } : {}),
      ...(plan ? { plan } : {}),
    };
  });
}

export function getSessionWithMessages(sessionId: string): {
  session: ChatSessionRecord;
  messages: ChatMessage[];
} | null {
  const session = getSession(sessionId);
  if (!session) return null;
  return { session, messages: loadMessages(sessionId) };
}
