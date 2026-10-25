/**
 * 工作空间 CRUD（catalog.db workspaces 表 + app_kv）。
 */
import fs from "node:fs";
import path from "node:path";
import {
  createWorkspaceId,
  DEFAULT_WORKSPACE_ID,
  type ReorderInput,
  type WorkspaceCreateInput,
  type WorkspaceRecord,
} from "@thinker-workbench/shared";
import { getDefaultWorkspaceRoot } from "../../config/paths";
import { getGeneralSettings } from "../../config/settingsStore";
import { closeTraceDb } from "../../trace/workspaceTraceDb";
import { destroyWorkspaceChatDb, openWorkspaceChatDb } from "../thinkerDb";
import { catalog, type WsRow } from "./db";
import { getKv, getLastWorkspaceId, KV_ACTIVE, setKv, setLastWorkspaceId } from "./kv";
import { mapWorkspace } from "./rows";
import { lookupIndexBySession } from "./sessionIndex";
import { listSessions, removeSession } from "./sessions";

function requireWorkspace(id: string): WorkspaceRecord {
  const row = getWorkspace(id);
  if (!row) throw new Error("Workspace not found.");
  return row;
}

function nextWorkspaceSortOrder(): number {
  const row = catalog()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM workspaces")
    .get() as { m: number };
  return row.m + 1;
}

export function listWorkspaces(): WorkspaceRecord[] {
  const rows = catalog()
    .prepare(
      `SELECT * FROM workspaces
       ORDER BY pinned DESC, sort_order ASC, updated_at DESC`,
    )
    .all() as WsRow[];
  return rows.map(mapWorkspace);
}

/**
 * 确保内置默认工作空间存在（固定 id，根目录 `<dataDir>/workspaces/ws_default/project`）。
 * 默认空间不可删除，仅可清空会话；缺失时会补建（即使已有其它工作空间）。
 */
export function ensureDefaultWorkspace(): WorkspaceRecord | null {
  const rootPath = path.resolve(getDefaultWorkspaceRoot());
  // 先按固定 id 命中；老数据可能 id 不同但根相同，再按根路径兜底。
  const byId = getWorkspace(DEFAULT_WORKSPACE_ID);
  const byRoot = byId
    ? null
    : (catalog().prepare("SELECT * FROM workspaces WHERE root_path = ?").get(rootPath) as
        | WsRow
        | undefined);
  const existing = byId ?? (byRoot ? mapWorkspace(byRoot) : null);
  if (existing) {
    openWorkspaceChatDb(existing.id);
    if (!getLastWorkspaceId()) setLastWorkspaceId(existing.id);
    return existing;
  }

  fs.mkdirSync(rootPath, { recursive: true });
  const name = getGeneralSettings().uiLocale === "zh" ? "默认工作空间" : "Default workspace";
  const created = createWorkspace({ rootPath, name, id: DEFAULT_WORKSPACE_ID });
  if (!getLastWorkspaceId()) setLastWorkspaceId(created.id);
  return created;
}

export function getWorkspace(id: string): WorkspaceRecord | null {
  const row = catalog().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
    | WsRow
    | undefined;
  return row ? mapWorkspace(row) : null;
}

export function createWorkspace(input: WorkspaceCreateInput): WorkspaceRecord {
  const rootPath = path.resolve(input.rootPath.trim());
  if (!rootPath || !fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error("Workspace directory does not exist.");
  }
  const existing = catalog()
    .prepare("SELECT * FROM workspaces WHERE root_path = ?")
    .get(rootPath) as WsRow | undefined;
  if (existing) {
    openWorkspaceChatDb(existing.id);
    return mapWorkspace(existing);
  }

  const requestedId = input.id?.trim();
  if (requestedId) {
    const byId = getWorkspace(requestedId);
    if (byId) {
      openWorkspaceChatDb(byId.id);
      return byId;
    }
  }

  const now = Date.now();
  const id = requestedId || createWorkspaceId();
  const name = (input.name?.trim() || path.basename(rootPath) || "Workspace").slice(0, 120);
  const sortOrder = nextWorkspaceSortOrder();
  catalog()
    .prepare(
      `INSERT INTO workspaces(id, name, root_path, pinned, sort_order, created_at, updated_at)
       VALUES(?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(id, name, rootPath, sortOrder, now, now);
  openWorkspaceChatDb(id);
  return requireWorkspace(id);
}

/**
 * 设置工作空间侧栏别名（不改磁盘目录）。
 * 空串则回落为 `rootPath` 的文件夹名。
 */
export function renameWorkspace(id: string, name: string): WorkspaceRecord {
  const ws = requireWorkspace(id);
  const trimmed = name.trim().slice(0, 120);
  const next = trimmed || path.basename(ws.rootPath) || "Workspace";
  const now = Date.now();
  catalog()
    .prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?")
    .run(next, now, id);
  return requireWorkspace(id);
}

export function setWorkspacePinned(id: string, pinned: boolean): WorkspaceRecord {
  const now = Date.now();
  const r = catalog()
    .prepare("UPDATE workspaces SET pinned = ?, updated_at = ? WHERE id = ?")
    .run(pinned ? 1 : 0, now, id);
  if (r.changes === 0) throw new Error("Workspace not found.");
  return requireWorkspace(id);
}

export function reorderWorkspaces(input: ReorderInput): void {
  const upd = catalog().prepare(
    "UPDATE workspaces SET sort_order = ?, updated_at = ? WHERE id = ?",
  );
  const now = Date.now();
  const tx = catalog().transaction((ids: string[]) => {
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (id) upd.run(index, now, id);
    }
  });
  tx(input.orderedIds);
}

export function removeWorkspace(id: string): void {
  const ws = requireWorkspace(id);
  if (ws.isDefault) {
    throw new Error("Default workspace cannot be deleted. Clear chats instead.");
  }
  const r = catalog().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  if (r.changes === 0) throw new Error("Workspace not found.");
  // Trace 库与记忆库也在该目录下：先关句柄，否则 Windows 上文件被锁、目录删不掉
  closeTraceDb(id);
  destroyWorkspaceChatDb(id);
  const active = getKv(KV_ACTIVE);
  if (active && !lookupIndexBySession(active)) setKv(KV_ACTIVE, "");
  if (getLastWorkspaceId() === id) setLastWorkspaceId(null);
}

/**
 * 清空工作空间内全部会话与消息（保留工作空间目录与元数据）。
 * 旁路数据（checkpoint / Trace）由 `removeSession` → `purgeSessionArtifacts` 清理。
 * @returns 被删除会话的 threadId 列表。
 */
export function clearWorkspace(id: string): string[] {
  requireWorkspace(id);
  const sessions = listSessions(id);
  const threadIds = sessions.map((s) => s.threadId);
  for (const s of sessions) {
    removeSession(s.id);
  }
  return threadIds;
}

export function assertWorkspaceRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Workspace root does not exist: ${resolved}`);
  }
  return resolved;
}
