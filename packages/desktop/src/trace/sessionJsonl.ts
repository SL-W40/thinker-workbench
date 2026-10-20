/**
 * 每会话 append-only JSONL 载荷存储。
 */
import fs from "node:fs";
import path from "node:path";
import { createId, isRecord, type TracePayloadRecord } from "@thinker-workbench/shared";
import { getTraceDir } from "../config/paths";
import { deletePayloadIndex, findPayloadIndex, notePayloadIndex } from "./traceDb";

function sessionsDir(): string {
  return path.join(getTraceDir(), "sessions");
}

function sessionFile(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(sessionsDir(), `${safe}.jsonl`);
}

export function ensureTraceDirs(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}

/** 追加一条 payload，并记下字节偏移。 */
export function appendPayload(
  sessionId: string,
  record: Omit<TracePayloadRecord, "id"> & { id?: string },
): string {
  ensureTraceDirs();
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
  const file = sessionFile(sessionId);
  const payload = Buffer.from(`${JSON.stringify(line)}\n`, "utf8");
  let offset = 0;
  try {
    offset = fs.statSync(file).size;
  } catch {
    offset = 0;
  }
  fs.appendFileSync(file, payload);
  notePayloadIndex(sessionId, id, offset, payload.length);
  return id;
}

/** 按偏移读一条 payload。 */
function readPayloadSlice(
  sessionId: string,
  offset: number,
  length: number,
): TracePayloadRecord | null {
  const file = sessionFile(sessionId);
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
function rebuildPayloadIndex(sessionId: string): void {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  deletePayloadIndex(sessionId);
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
        if (isRecord(row) && row.id) notePayloadIndex(sessionId, row.id, offset, end - offset);
      } catch {
        /* 跳过坏行 */
      }
    }
    offset = end;
  }
}

/** 按 id 读取 payload；索引缺失时对该会话建一次索引再定位。 */
export function readPayload(sessionId: string, payloadId: string): TracePayloadRecord | null {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return null;
  const load = (loc: { offset: number; length: number } | null) =>
    loc ? readPayloadSlice(sessionId, loc.offset, loc.length) : null;
  const first = load(findPayloadIndex(sessionId, payloadId));
  if (first?.id === payloadId) return first;
  rebuildPayloadIndex(sessionId);
  const second = load(findPayloadIndex(sessionId, payloadId));
  return second?.id === payloadId ? second : null;
}

export function sessionJsonlPath(sessionId: string): string {
  return sessionFile(sessionId);
}

export function sessionJsonlSize(sessionId: string): number {
  const file = sessionFile(sessionId);
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function removeSessionJsonl(sessionId: string): void {
  const file = sessionFile(sessionId);
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  try {
    deletePayloadIndex(sessionId);
  } catch {
    /* 索引库尚未打开时忽略 */
  }
}

/** 估算 trace/sessions 总字节。 */
export function totalSessionsBytes(): number {
  const dir = sessionsDir();
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
