/**
 * SQLite schema：catalog（工作空间元数据）与每工作空间 chat.db。
 */

export const CATALOG_SCHEMA_VERSION = 1;
export const CHAT_SCHEMA_VERSION = 1;

/** 全局目录库：工作空间列表 + app_kv。 */
export const CATALOG_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_index (
  session_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_index_workspace
  ON session_index(workspace_id);
`;

/** 单工作空间聊天库：会话 + 消息。 */
export const CHAT_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  run_status TEXT NOT NULL DEFAULT 'idle',
  active_run_id TEXT,
  interrupt_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_order
  ON chat_sessions(pinned DESC, sort_order ASC, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages(session_id, seq ASC);
`;

/** 日志数据分片 schema（按条数滚动的 `log-YYYY-MM-DD_HHMMSS.db`）。 */
export const LOG_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  trace_id TEXT,
  span_id TEXT,
  thread_id TEXT,
  run_id TEXT,
  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_log_ts ON log_records(ts DESC);
CREATE INDEX IF NOT EXISTS idx_log_trace ON log_records(trace_id);
CREATE INDEX IF NOT EXISTS idx_log_source_level ON log_records(source, level, ts DESC);
`;

export const LOG_SCHEMA_VERSION = 1;

/**
 * 日志路由元库 `meta.db`：当前活跃分片、各片条数、trace→分片亲和。
 * 未完成的 trace 继续写入其绑定分片；新 trace 进入活跃分片。
 */
export const LOG_META_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shards (
  key TEXT PRIMARY KEY NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  accepting_new INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS trace_routes (
  trace_id TEXT PRIMARY KEY NOT NULL,
  shard_key TEXT NOT NULL,
  last_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trace_routes_shard ON trace_routes(shard_key);
`;

export const LOG_META_SCHEMA_VERSION = 1;

/** 单分片接纳「新 trace」的条数阈值；超限后滚动，未完成 trace 仍可写入原分片。 */
export const LOG_RECORDS_PER_SHARD = 50_000;
