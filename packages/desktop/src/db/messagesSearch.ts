/**
 * 会话消息全文检索索引（SQLite FTS5，落在每个工作空间的 chat.db）。
 *
 * 选词器用 `trigram`：中英混排都能做子串匹配（unicode61 对中文只能拆单字，
 * 短中文串会被 AND 查询打散）。三字符以下的查询 FTS5 trigram 无法命中，
 * 退化为 `LIKE` 扫描（受 LIMIT 约束，成本可控）。
 *
 * 写入口与删除口都收在 `db/workspacesStore/messages.ts` / `sessions.ts`，
 * 保证「消息变、索引变」没有第二个写入者。
 */
import fs from "node:fs";
import {
  type ChatSearchInput,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  type SearchHit,
} from "@thinker-workbench/shared";
import type Database from "better-sqlite3";
import { getWorkspaceChatDbPath } from "../config/paths";
import { desktopLog } from "../log/setup";
import { openCatalogDb, openWorkspaceChatDb } from "./thinkerDb";

const log = desktopLog("search");

/** FTS5 虚拟表 DDL（幂等；与 chat.db 同生命周期）。 */
export const CHAT_SEARCH_SCHEMA_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
  text,
  session_id UNINDEXED,
  role UNINDEXED,
  seq UNINDEXED,
  created_at UNINDEXED,
  tokenize = 'trigram'
);
`;

/** trigram 生效的最小查询长度；短于此走 LIKE 兜底。 */
const TRIGRAM_MIN_LEN = 3;

/** 片段窗口长度上限。 */
const SNIPPET_MAX = 120;

/** LIKE 转义用的通配符集合。 */
const LIKE_WILDCARDS = /[\\%_]/g;

/** 索引行（写入侧最小信息量）。 */
export type SearchIndexRow = {
  seq: number;
  /** 角色：user / assistant / tool / system。 */
  role: string;
  text: string;
  createdAt: number;
};

/**
 * 建（或补齐）检索虚拟表；每张 chat.db 打开时调用一次。
 * FTS5 不可用时降级为「无索引」，不让启动失败。
 */
export function ensureSearchIndex(db: Database.Database): boolean {
  try {
    db.exec(CHAT_SEARCH_SCHEMA_SQL);
    return true;
  } catch (err) {
    log.warn("检索索引不可用，降级为标题检索", { error: String(err) });
    return false;
  }
}

/** 索引是否可用（虚拟表存在且可查）。 */
export function hasSearchIndex(db: Database.Database): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages_fts'")
      .get() as { name?: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

/**
 * 幂等回填：索引为空但库里有消息时重建该会话索引。
 * 以「会话维度」比对，避免全表重建；`indexSessionMessages` 自身先删后插。
 */
export function reindexSessionIfMissing(db: Database.Database, sessionId: string): void {
  if (!hasSearchIndex(db)) return;
  try {
    const indexed = db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages_fts WHERE session_id = ?")
      .get(sessionId) as { n: number } | undefined;
    const stored = db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?")
      .get(sessionId) as { n: number } | undefined;
    if ((indexed?.n ?? 0) > 0 || (stored?.n ?? 0) === 0) return;
    const rows = db
      .prepare(
        "SELECT seq, role, text, created_at FROM chat_messages WHERE session_id = ? ORDER BY seq ASC",
      )
      .all(sessionId) as Array<{ seq: number; role: string; text: string; created_at: number }>;
    indexSessionMessages(
      db,
      sessionId,
      rows.map((r) => ({ seq: r.seq, role: r.role, text: r.text, createdAt: r.created_at })),
    );
  } catch (err) {
    log.warn("会话索引回填失败", { sessionId, error: String(err) });
  }
}

/** 重建某会话的全部消息索引（先删后插，幂等）。 */
export function indexSessionMessages(
  db: Database.Database,
  sessionId: string,
  rows: SearchIndexRow[],
): void {
  if (!hasSearchIndex(db)) return;
  try {
    const del = db.prepare("DELETE FROM chat_messages_fts WHERE session_id = ?");
    const ins = db.prepare(
      `INSERT INTO chat_messages_fts(session_id, role, seq, created_at, text)
       VALUES(?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      del.run(sessionId);
      for (const row of rows) {
        const text = typeof row.text === "string" ? row.text : "";
        if (!text.trim()) continue;
        ins.run(sessionId, row.role, row.seq, row.createdAt, text);
      }
    })();
  } catch (err) {
    log.warn("写入检索索引失败", { sessionId, error: String(err) });
  }
}

/** 删除某会话的索引（删会话 / 清空工作空间走此出口）。 */
export function deleteSessionIndex(db: Database.Database, sessionId: string): void {
  if (!hasSearchIndex(db)) return;
  try {
    db.prepare("DELETE FROM chat_messages_fts WHERE session_id = ?").run(sessionId);
  } catch (err) {
    log.warn("删除检索索引失败", { sessionId, error: String(err) });
  }
}

/** 把用户输入转成 FTS5 MATCH 表达式（短语 + 多词 AND）。 */
export function buildMatchQuery(query: string): string {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return "";
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" AND ");
}

/** LIKE 模式构造：转义通配符并两侧加 `%`。 */
export function buildLikePattern(query: string): string {
  const escaped = query.trim().replace(LIKE_WILDCARDS, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * 从正文里截一段命中片段。
 * 返回纯文本 + 命中区间（由 UI 自行加粗，避免在 DB 层拼 HTML）。
 */
export function buildSnippet(
  text: string,
  query: string,
  maxLen = SNIPPET_MAX,
): { snippet: string; match: { from: number; to: number } | null } {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return { snippet: "", match: null };
  const needle = query.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  const hit = needle ? findFirstMatchIndex(flat, needle) : -1;
  if (hit < 0) {
    const head = flat.slice(0, maxLen);
    return { snippet: head, match: null };
  }
  const start = Math.max(0, hit - Math.floor((maxLen - needle.length) / 2));
  const snippet = flat.slice(start, start + maxLen);
  const from = hit - start;
  return {
    snippet,
    match: { from, to: Math.min(snippet.length, from + needle.length) },
  };
}

/** 大小写不敏感的首个命中位置；二分无用，直接 indexOf on lowercased。 */
function findFirstMatchIndex(haystack: string, needle: string): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

type RawBodyHit = SearchHit & { sortAt: number };

/**
 * 单工作空间内的检索：先验标题，再验正文。
 * 任一步出错只降级本工作空间，不影响整体检索。
 */
function searchWorkspace(workspaceId: string, query: string, limit: number): RawBodyHit[] {
  const db = openWorkspaceChatDb(workspaceId);
  const out: RawBodyHit[] = [];
  const like = buildLikePattern(query);
  const titleRow = "id, thread_id, title, updated_at";

  try {
    const titleHits = db
      .prepare(
        `SELECT ${titleRow} FROM chat_sessions WHERE title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(like, limit) as Array<{
      id: string;
      thread_id: string;
      title: string;
      updated_at: number;
    }>;
    for (const row of titleHits) {
      out.push({
        sessionId: row.id,
        threadId: row.thread_id,
        workspaceId,
        title: row.title,
        messageIndex: null,
        role: null,
        createdAt: row.updated_at,
        snippet: "",
        snippetMatch: null,
        titleMatch: true,
        sortAt: row.updated_at,
      });
    }
  } catch (err) {
    log.warn("会话标题检索失败", { workspaceId, error: String(err) });
  }

  type BodyRow = {
    session_id: string;
    role: string;
    seq: number;
    created_at: number;
    text: string;
  };

  try {
    const useFts = hasSearchIndex(db) && query.trim().replace(/\s+/g, "").length >= TRIGRAM_MIN_LEN;
    let rows: BodyRow[] = [];
    if (useFts) {
      const match = buildMatchQuery(query);
      rows = db
        .prepare(
          `SELECT session_id, role, seq, created_at, text FROM chat_messages_fts
           WHERE chat_messages_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(match, limit) as BodyRow[];
    } else {
      rows = db
        .prepare(
          `SELECT session_id, role, text, created_at, seq FROM chat_messages
           WHERE text LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`,
        )
        .all(like, limit) as BodyRow[];
    }
    const sessions = new Map(
      (
        db.prepare("SELECT id, thread_id, title FROM chat_sessions").all() as Array<{
          id: string;
          thread_id: string;
          title: string;
        }>
      ).map((s) => [s.id, s] as const),
    );
    for (const row of rows) {
      const session = sessions.get(row.session_id);
      if (!session) continue;
      const { snippet, match } = buildSnippet(row.text, query);
      out.push({
        sessionId: row.session_id,
        threadId: session.thread_id,
        workspaceId,
        title: session.title,
        messageIndex: row.seq,
        role: row.role,
        createdAt: row.created_at,
        snippet,
        snippetMatch: match,
        titleMatch: false,
        sortAt: row.created_at,
      });
    }
  } catch (err) {
    log.warn("会话正文检索失败", { workspaceId, error: String(err) });
  }

  return out;
}

/**
 * 跨工作空间检索主入口。
 * 跳过磁盘上还没有 chat.db 的工作空间，避免为了检索而创建空库。
 */
export function searchChat(input: ChatSearchInput): { hits: SearchHit[]; truncated: boolean } {
  const query = (input.query ?? "").trim();
  if (!query) return { hits: [], truncated: false };
  const limit = clampLimit(input.limit);
  const workspaces = listSearchableWorkspaces(input.workspaceId);

  const collected: RawBodyHit[] = [];
  for (const wsId of workspaces) {
    collected.push(...searchWorkspace(wsId, query, limit));
  }

  // 标题命中优先，其余按时间倒序（跨库 bm25 不可比，用时间做稳定排序）
  collected.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
    return b.sortAt - a.sortAt;
  });

  const truncated = collected.length > limit;
  const hits = collected.slice(0, limit).map((hit) => {
    const { sortAt: _sortAt, ...rest } = hit;
    return rest;
  });
  return { hits, truncated };
}

/** 要检索的工作空间列表：指定了则只取该空间，否则全部（不含没有 chat.db 的）。 */
function listSearchableWorkspaces(workspaceId?: string): string[] {
  const catalog = openCatalogDb();
  try {
    const rows = catalog
      .prepare("SELECT id FROM workspaces ORDER BY sort_order ASC")
      .all() as Array<{ id: string }>;
    return rows
      .map((r) => r.id)
      .filter((id) => {
        if (workspaceId && id !== workspaceId) return false;
        // 文件不存在时不打开（openWorkspaceChatDb 会顺手建库）
        return fs.existsSync(getWorkspaceChatDbPath(id));
      });
  } catch (err) {
    log.warn("列举工作空间失败", { error: String(err) });
    return [];
  }
}

/** 结果上限归一：非法或超限都压到合法区间。 */
export function clampLimit(limit: unknown): number {
  const n = typeof limit === "number" ? limit : Number.parseInt(String(limit ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.floor(n));
}
