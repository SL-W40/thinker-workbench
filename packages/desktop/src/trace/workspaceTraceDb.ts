/**
 * 多工作区 trace.db 句柄管理（懒加载 + 上限 LRU + 显式关闭）。
 *
 * Trace 随工作区自包含：`<dataDir>/workspaces/<id>/trace/trace.db`。
 * 跨工作区视图（不传 workspaceId 的列表查询）在此聚合。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  getWorkspacesRoot,
  getWorkspaceTraceDbPath,
  getWorkspaceTraceSessionsDir,
} from "../config/paths";
import { TRACE_SCHEMA_SQL, TRACE_SCHEMA_VERSION } from "../db/schema";
import { lookupIndexBySession } from "../db/workspacesStore/sessionIndex";

/** 同时打开的库句柄上限（超出则关最久未用的）。 */
const MAX_OPEN_HANDLES = 8;

const handles = new Map<string, Database.Database>();

function openFor(workspaceId: string): Database.Database {
  const file = getWorkspaceTraceDbPath(workspaceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(TRACE_SCHEMA_SQL);
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = ?").get("version") as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_meta(key, value) VALUES (?, ?)").run(
      "version",
      String(TRACE_SCHEMA_VERSION),
    );
  }
  // 回填历史数据：早期 run_count 依赖永不触发的 bumpRun，全为 0
  db.exec(
    `UPDATE sessions SET run_count = (
       SELECT COUNT(DISTINCT COALESCE(run_id, '')) FROM spans WHERE session_id = sessions.session_id
     ) WHERE run_count = 0`,
  );
  return db;
}

/** 确保某工作区的 trace 目录与 sessions 目录存在。 */
function ensureDirs(workspaceId: string): void {
  fs.mkdirSync(path.dirname(getWorkspaceTraceDbPath(workspaceId)), { recursive: true });
  fs.mkdirSync(getWorkspaceTraceSessionsDir(workspaceId), { recursive: true });
}

/** 取某工作区的 trace.db（不存在则建）；同时确保 jsonl 目录存在。 */
export function traceDbFor(workspaceId: string): Database.Database {
  const id = workspaceId.trim();
  if (!id) throw new Error("workspaceId is required.");
  const existing = handles.get(id);
  if (existing) {
    // LRU：命中后移到末尾
    handles.delete(id);
    handles.set(id, existing);
    return existing;
  }
  ensureDirs(id);
  const db = openFor(id);
  handles.set(id, db);
  while (handles.size > MAX_OPEN_HANDLES) {
    const oldest = handles.keys().next().value;
    if (oldest === undefined) break;
    closeTraceDb(oldest);
  }
  return db;
}

/** 关闭并移除某工作区的句柄（删工作区前必须先关，否则文件被锁删不掉）。 */
export function closeTraceDb(workspaceId: string): void {
  const db = handles.get(workspaceId);
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  handles.delete(workspaceId);
}

/** 关闭全部句柄（退出 / 切换 dataDir）。 */
export function closeAllTraceDbs(): void {
  for (const id of [...handles.keys()]) {
    closeTraceDb(id);
  }
}

/** 磁盘上已存在的工作区 id 列表（不依赖 catalog，避免循环依赖）。 */
export function listWorkspaceIds(): string[] {
  const root = getWorkspacesRoot();
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith(".")) continue;
    try {
      if (fs.statSync(path.join(root, name)).isDirectory()) out.push(name);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * 由会话 id 反查所属工作区（catalog 的 session_index）。
 * 查不到返回 null：调用方据此跳过写入或返回空结果。
 */
export function resolveWorkspaceIdForSession(sessionId: string): string | null {
  const id = sessionId.trim();
  if (!id) return null;
  try {
    return lookupIndexBySession(id);
  } catch {
    return null;
  }
}
