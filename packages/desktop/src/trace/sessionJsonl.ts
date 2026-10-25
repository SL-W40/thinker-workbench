/**
 * 每会话 append-only JSONL 载荷存储（落在所属工作区的 trace 目录下）。
 */
import fs from "node:fs";
import path from "node:path";
import { createId, isRecord, type TracePayloadRecord } from "@thinker-workbench/shared";
import { getWorkspaceTraceSessionsDir } from "../config/paths";
import { deletePayloadIndex, findPayloadIndex, notePayloadIndex } from "./traceDb";

function sessionsDir(workspaceId: string): string {
  return getWorkspaceTraceSessionsDir(workspaceId);
}

function sessionFile(workspaceId: string, sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(sessionsDir(workspaceId), `${safe}.jsonl`);
}

/** 确保某工作区的 trace 目录与 sessions 目录存在。 */
export function ensureTraceDirs(workspaceId: string): void {
  fs.mkdirSync(sessionsDir(workspaceId), { recursive: true });
}

/** 追加一条 payload，并记下字节偏移。 */
export function appendPayload(
  workspaceId: string,
  sessionId: string,
  record: Omit<TracePayloadRecord, "id"> & { id?: string },
): string {
  ensureTraceDirs(workspaceId);
  const id = record.id ?? createId("pl");
  const line: TracePayloadRecord = {
    id,
    runId: record.runId,
    side: record.side,
    ts: record.ts,
    bytes: record.bytes,
    truncated: record.truncated,
    json: record.json,
  };
  const file = sessionFile(workspaceId, sessionId);
  const payload = Buffer.from(`${JSON.stringify(line)}\n`, "utf8");
  let offset = 0;
  try {
    offset = fs.statSync(file).size;
  } catch {
    offset = 0;
  }
  fs.appendFileSync(file, payload);
  notePayloadIndex(workspaceId, sessionId, id, offset, payload.length);
  return id;
}

/** 按偏移读一条 payload。 */
function readPayloadSlice(
  workspaceId: string,
  sessionId: string,
  offset: number,
  length: number,
): TracePayloadRecord | null {
  const file = sessionFile(workspaceId, sessionId);
  if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) return null;
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, offset);
    const text = buf.subarray(0, n).toString("utf8").trim();
    if (!text) return null;
    const payload = JSON.parse(text) as TracePayloadRecord;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

/**
 * 为缺少索引的旧 jsonl 建一次偏移表。
 * 之后 readPayload 只按偏移取行。
 */
function rebuildPayloadIndex(workspaceId: string, sessionId: string): void {
  const file = sessionFile(workspaceId, sessionId);
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  deletePayloadIndex(workspaceId, sessionId);
  let offset = 0;
  while (offset < buf.length) {
    let end = buf.indexOf(0x0a, offset);
    const includeNl = end >= 0;
    if (!includeNl) end = buf.length;
    else end += 1;
    const text = buf
      .subarray(offset, includeNl ? end - 1 : end)
      .toString("utf8")
      .trim();
    if (text) {
      try {
        const row = JSON.parse(text) as TracePayloadRecord;
        if (isRecord(row) && row.id) {
          notePayloadIndex(workspaceId, sessionId, row.id, offset, end - offset);
        }
      } catch {
        /* 跳过坏行 */
      }
    }
    offset = end;
  }
}

/** 按 id 读取 payload；索引缺失时对该会话建一次索引再定位。 */
export function readPayload(
  workspaceId: string,
  sessionId: string,
  payloadId: string,
): TracePayloadRecord | null {
  const file = sessionFile(workspaceId, sessionId);
  if (!fs.existsSync(file)) return null;
  const load = (loc: { offset: number; length: number } | null) =>
    loc ? readPayloadSlice(workspaceId, sessionId, loc.offset, loc.length) : null;
  const first = load(findPayloadIndex(workspaceId, sessionId, payloadId));
  if (first?.id === payloadId) return first;
  rebuildPayloadIndex(workspaceId, sessionId);
  const second = load(findPayloadIndex(workspaceId, sessionId, payloadId));
  return second?.id === payloadId ? second : null;
}

export function sessionJsonlPath(workspaceId: string, sessionId: string): string {
  return sessionFile(workspaceId, sessionId);
}

export function sessionJsonlSize(workspaceId: string, sessionId: string): number {
  const file = sessionFile(workspaceId, sessionId);
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function removeSessionJsonl(workspaceId: string, sessionId: string): void {
  const file = sessionFile(workspaceId, sessionId);
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  try {
    deletePayloadIndex(workspaceId, sessionId);
  } catch {
    /* 索引库尚未打开时忽略 */
  }
}

/** 估算某工作区 trace/sessions 总字节。 */
export function totalSessionsBytes(workspaceId: string): number {
  const dir = sessionsDir(workspaceId);
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    try {
      total += fs.statSync(path.join(dir, name)).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}
