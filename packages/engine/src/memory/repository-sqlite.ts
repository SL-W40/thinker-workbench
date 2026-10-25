/**
 * 记忆仓库的持久化实现。
 *
 * 受包边界约束，引擎无法直连 desktop 的 chat.db；且 better-sqlite3 在引擎依赖树中
 * 默认不可静态解析（仅作为 langchain sqlite checkpointer 的传递依赖存在）。
 * 因此这里用「动态 import + 内存兜底」：
 *   - 若运行环境能解析 better-sqlite3，则在工作区目录建 memory.sqlite（会话级耐久）；
 *   - 否则退化为进程内 Map（跨轮可用，不跨进程重启）。
 * 要启用磁盘耐久，只需在 packages/engine/package.json 显式声明 better-sqlite3 并安装。
 */

import { dataPath } from "@thinker-workbench/shared";
import type { MemoryKind, MemoryRepository } from "./repository";

/** 进程内退化实现（无 dataDir 或 better-sqlite3 不可用时）。 */
function createInMemoryRepository(): MemoryRepository {
  const store = new Map<string, string>();
  return {
    async load(sessionId, kind) {
      return store.get(`${sessionId}::${kind}`) ?? null;
    },
    async save(sessionId, kind, content) {
      store.set(`${sessionId}::${kind}`, content);
    },
  };
}

/**
 * 由 dataDir + workspaceId 构造记忆仓库（异步：尝试 SQLite，失败兜底内存）。
 * 落点 `<dataDir>/workspaces/<id>/memory.sqlite`；无 workspaceId 时退回内存实现。
 */
export async function createSqliteMemoryRepository(
  dataDir: string | undefined,
  workspaceId?: string,
): Promise<MemoryRepository> {
  if (!dataDir) return createInMemoryRepository();
  const wsId = workspaceId?.trim();
  if (!wsId) return createInMemoryRepository();
  try {
    // 用变量名规避 tsc 对尚未安装依赖的静态解析（运行时才真正解析）。
    const sqliteModuleName = "better-sqlite3";
    const mod = (await import(sqliteModuleName)) as unknown as {
      default?: new (path: string) => SqliteLike;
    };
    const Database = mod.default;
    if (!Database) return createInMemoryRepository();
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dbFile = dataPath(dataDir, "wsMemory", { workspaceId: wsId });
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const db = new Database(dbFile);
    db.exec(
      `CREATE TABLE IF NOT EXISTS session_memory (
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, kind)
      )`,
    );
    const loadStmt = db.prepare(
      "SELECT content FROM session_memory WHERE session_id = ? AND kind = ?",
    );
    const saveStmt = db.prepare(
      `INSERT INTO session_memory (session_id, kind, content, version, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, kind) DO UPDATE SET
         content = excluded.content,
         version = excluded.version,
         updated_at = excluded.updated_at`,
    );
    return {
      async load(sessionId: string, kind: MemoryKind) {
        const row = loadStmt.get(sessionId, kind) as { content: string } | undefined;
        return row ? row.content : null;
      },
      async save(sessionId: string, kind: MemoryKind, content: string, version: number) {
        saveStmt.run(sessionId, kind, content, version, Date.now());
      },
    };
  } catch {
    return createInMemoryRepository();
  }
}

/** 极简 SQLite 形状（仅用到的方法）。 */
interface SqliteLike {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => unknown;
  };
}
