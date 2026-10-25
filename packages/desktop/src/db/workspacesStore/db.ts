/**
 * workspacesStore 内部共享：库句柄与行类型。
 * catalog.db 存元数据；每工作空间 chat.db 存会话与消息。
 */
import type Database from "better-sqlite3";
import { openCatalogDb, openWorkspaceChatDb } from "../thinkerDb";

export type WsRow = {
  id: string;
  name: string;
  root_path: string;
  pinned: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

export type SessionRow = {
  id: string;
  thread_id: string;
  workspace_id: string;
  title: string;
  pinned: number;
  sort_order: number;
  run_status: string;
  active_run_id: string | null;
  interrupt_reason: string | null;
  created_at: number;
  updated_at: number;
  /** 会话待办 JSON；老库缺列时为 undefined。 */
  todos_json?: string | null;
};

export type MsgRow = {
  id: string;
  session_id: string;
  role: string;
  text: string;
  created_at: number;
  pending: number;
  payload_json: string | null;
  seq: number;
};

export function catalog(): Database.Database {
  return openCatalogDb();
}

export function chatDb(workspaceId: string): Database.Database {
  return openWorkspaceChatDb(workspaceId);
}
