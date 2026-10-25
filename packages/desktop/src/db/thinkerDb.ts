/**
 * 打开 catalog.db 与各工作空间 chat.db（better-sqlite3 + WAL）。
 * 布局：`<dataDir>/state/catalog.db`、`<dataDir>/workspaces/<id>/chat.db`。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getCatalogDbPath, getWorkspaceChatDbPath, getWorkspaceDataDir } from "../config/paths";
import { ensureSearchIndex } from "./messagesSearch";
import {
  CATALOG_SCHEMA_SQL,
  CATALOG_SCHEMA_VERSION,
  CHAT_SCHEMA_SQL,
  CHAT_SCHEMA_VERSION,
} from "./schema";

function dbLog(message: string, meta?: Record<string, unknown>): void {
  // 避免与 log/setup 循环依赖；启动早期只用 stderr
  try {
    console.info(`[db] ${message}`, meta ?? "");
  } catch {
    /* ignore */
  }
}

let catalog: Database.Database | null = null;
let catalogPath: string | null = null;
const workspaceDbs = new Map<string, Database.Database>();

/**
 * 幂等补列：`CREATE TABLE IF NOT EXISTS` 不会给已存在的表加新列，
 * 老库升级缺的列（如会话待办）在这里逐列补上；已存在则直接跳过。
 */
function ensureColumn(
  instance: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  if (cols.some((col) => col.name === column)) return;
  instance.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function migrateVersion(instance: Database.Database, version: number): void {
  const row = instance.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number.parseInt(row.value, 10) : 0;
  if (!Number.isFinite(current) || current < version) {
    instance
      .prepare(
        "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(String(version));
  }
}

/** 打开全局目录库。 */
export function openCatalogDb(): Database.Database {
  const dbPath = getCatalogDbPath();
  if (catalog && catalogPath === dbPath) return catalog;

  if (catalog) {
    try {
      catalog.close();
    } catch {
      /* ignore */
    }
    catalog = null;
  }
  for (const [id, db] of workspaceDbs) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    workspaceDbs.delete(id);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(CATALOG_SCHEMA_SQL);
  migrateVersion(instance, CATALOG_SCHEMA_VERSION);
  catalog = instance;
  catalogPath = dbPath;
  dbLog("catalog opened", { path: dbPath, version: CATALOG_SCHEMA_VERSION });
  return instance;
}

/** 打开（或创建）某工作空间的 chat.db。 */
export function openWorkspaceChatDb(workspaceId: string): Database.Database {
  const existing = workspaceDbs.get(workspaceId);
  if (existing) return existing;

  openCatalogDb();
  const dbPath = getWorkspaceChatDbPath(workspaceId);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(CHAT_SCHEMA_SQL);
  // 会话待办列（老库缺列时补上）
  ensureColumn(instance, "chat_sessions", "todos_json", "todos_json TEXT");
  // 全文检索虚拟表（FTS5 缺失时不拖垮打开流程）
  try {
    ensureSearchIndex(instance);
  } catch {
    /* ensureSearchIndex 内部已兜底 */
  }
  migrateVersion(instance, CHAT_SCHEMA_VERSION);
  workspaceDbs.set(workspaceId, instance);
  return instance;
}

/** 关闭并删除工作空间数据目录。 */
export function destroyWorkspaceChatDb(workspaceId: string): void {
  const db = workspaceDbs.get(workspaceId);
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    workspaceDbs.delete(workspaceId);
  }
  const dir = getWorkspaceDataDir(workspaceId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** 关闭全部数据库（退出前）。 */
export function closeThinkerDb(): void {
  for (const [id, db] of workspaceDbs) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    workspaceDbs.delete(id);
  }
  if (catalog) {
    try {
      catalog.close();
    } catch {
      /* ignore */
    }
    catalog = null;
    catalogPath = null;
  }
}
