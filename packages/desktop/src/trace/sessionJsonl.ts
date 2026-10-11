/**
 * 每会话 append-only JSONL 载荷存储。
 */
import fs from "node:fs";
import path from "node:path";
import { createId, type TracePayloadRecord } from "@thinker-workbench/shared";
import { getTraceDir } from "../config/paths";

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

/** 追加一条 payload，返回 payload id。 */
export function appendPayload(
  sessionId: string,
  record: Omit<TracePayloadRecord, "id"> & { id?: string },
): string {
  ensureTraceDirs();
  const id = record.id ?? createId("pl");
  const line: TracePayloadRecord = {
    id,
    spanId: record.spanId,
    side: record.side,
    ts: record.ts,
    bytes: record.bytes,
    truncated: record.truncated,
    json: record.json,
  };
  fs.appendFileSync(sessionFile(sessionId), `${JSON.stringify(line)}\n`, "utf8");
  return id;
}

/** 按 id 扫描 jsonl（会话内载荷量可控；大文件可后续加索引）。 */
export function readPayload(sessionId: string, payloadId: string): TracePayloadRecord | null {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as TracePayloadRecord;
      if (row.id === payloadId) return row;
    } catch {
      /* 跳过坏行 */
    }
  }
  return null;
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
