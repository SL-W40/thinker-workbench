/**
 * 打开 catalog.db 与各工作空间 chat.db（better-sqlite3 + WAL）。
 * 布局：`<dataDir>/catalog.db`、`<dataDir>/workspaces/<id>/chat.db`。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  getCatalogDbPath,
  getWorkspaceChatDbPath,
  getWorkspaceDataDir,
} from "../config/paths";
import {
  CATALOG_SCHEMA_SQL,
  CATALOG_SCHEMA_VERSION,
  CHAT_SCHEMA_SQL,
  CHAT_SCHEMA_VERSION,
} from "./schema";

function dbLog(message: string, meta?: Record<string, unknown>): void {
  // 避免与 log/setup 循环依赖；启动早期只用 stderr
  try {
    // eslint-disable-next-line no-console
    console.info(`[db] ${message}`, meta ?? "");
  } catch {
    /* ignore */
  }
}

let catalog: Database.Database | null = null;
let catalogPath: string | null = null;
const workspaceDbs = new Map<string, Database.Database>();

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

