/**
 * 行 → 领域对象映射（纯函数，不访问库）。
 */
import path from "node:path";
import {
  type ChatSessionRecord,
  DEFAULT_WORKSPACE_ID,
  type SessionRunStatus,
  type ThreadMeta,
  type WorkspaceRecord,
} from "@thinker-workbench/shared";
import { getDefaultWorkspaceRoot } from "../../config/paths";
import type { SessionRow, WsRow } from "./db";
import { readSessionTodos } from "./sessionTodos";

/** 默认工作空间判定：按固定 id，避免根路径随 dataDir 变化后判定漂移。 */
export function isDefaultWorkspaceId(id: string): boolean {
  return id === DEFAULT_WORKSPACE_ID;
}

/** 是否为内置默认工作空间根（`<dataDir>/workspaces/ws_default/project`）。 */
export function isDefaultWorkspaceRoot(rootPath: string): boolean {
  return path.resolve(rootPath) === path.resolve(getDefaultWorkspaceRoot());
}

export function mapWorkspace(row: WsRow): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDefault: isDefaultWorkspaceId(row.id),
  };
}

export function mapSession(row: SessionRow): ChatSessionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    workspaceId: row.workspace_id,
    title: row.title,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    runStatus: normalizeRunStatus(row.run_status),
    activeRunId: row.active_run_id,
    interruptReason: row.interrupt_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    todos: readSessionTodos(row.todos_json),
  };
}

/** 将未知 run_status 规范为 idle（运行期容错，非版本迁移）。 */
export function normalizeRunStatus(value: string): SessionRunStatus {
  if (
    value === "idle" ||
    value === "running" ||
    value === "queued" ||
    value === "cancelled" ||
    value === "crashed" ||
    value === "failed"
  ) {
    return value;
  }
  return "idle";
}

export function mapThread(row: SessionRow): ThreadMeta {
  return {
    id: row.thread_id,
    sessionId: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    updatedAt: row.updated_at,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    runStatus: normalizeRunStatus(row.run_status),
  };
}
