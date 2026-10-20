/**
 * session ↔ thread ↔ workspace 索引表（catalog.db）。
 */
import { catalog } from "./db";

export function indexSession(sessionId: string, threadId: string, workspaceId: string): void {
  catalog()
    .prepare(
      `INSERT INTO session_index(session_id, thread_id, workspace_id)
       VALUES(?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         workspace_id = excluded.workspace_id`,
    )
    .run(sessionId, threadId, workspaceId);
}

export function unindexSession(sessionId: string): void {
  catalog().prepare("DELETE FROM session_index WHERE session_id = ?").run(sessionId);
}

export function lookupIndexBySession(sessionId: string): string | null {
  const row = catalog()
    .prepare("SELECT workspace_id FROM session_index WHERE session_id = ?")
    .get(sessionId) as { workspace_id: string } | undefined;
  return row?.workspace_id ?? null;
}

export function lookupIndexByThread(
  threadId: string,
): { sessionId: string; workspaceId: string } | null {
  const row = catalog()
    .prepare("SELECT session_id, workspace_id FROM session_index WHERE thread_id = ?")
    .get(threadId) as { session_id: string; workspace_id: string } | undefined;
  return row ? { sessionId: row.session_id, workspaceId: row.workspace_id } : null;
}
