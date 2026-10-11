/**
 * Trace 载荷截断 / 脱敏（Main 落盘前统一执行）。
 */
import type { GeneralSettings } from "@thinker-workbench/shared";

export type TruncateLimits = {
  truncateEnabled: boolean;
  maxFieldBytes: number;
  maxPayloadBytes: number;
  maxMessageChars: number;
  maxHistoryMessages: number;
  captureBinary: "meta" | "omit";
  redactKeys: string[];
};

export type TruncateResult = {
  value: unknown;
  truncated: boolean;
  bytes: number;
};

export function limitsFromGeneral(g: GeneralSettings): TruncateLimits {
  return {
    truncateEnabled: g.traceTruncateEnabled,
    maxFieldBytes: g.traceMaxFieldBytes,
    maxPayloadBytes: g.traceMaxPayloadBytes,
    maxMessageChars: g.traceMaxMessageChars,
    maxHistoryMessages: g.traceMaxHistoryMessages,
    captureBinary: g.traceCaptureBinary,
    redactKeys: g.traceRedactKeys,
  };
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function isRedactKey(key: string, keys: string[]): boolean {
  const lower = key.toLowerCase();
  return keys.some((k) => k.toLowerCase() === lower);
}

function truncateString(s: string, maxBytes: number): { text: string; truncated: boolean } {
  if (utf8Bytes(s) <= maxBytes) return { text: s, truncated: false };
  let end = Math.min(s.length, maxBytes);
  while (end > 0 && utf8Bytes(s.slice(0, end)) > maxBytes) end -= 1;
  return { text: `${s.slice(0, Math.max(0, end))}…`, truncated: true };
}

/**
 * 按配置截断 / 脱敏任意 JSON 可序列化值。
 * `bytes` 为截断前 JSON.stringify 字节数（失败则用估算）。
 */
export function truncateForTrace(value: unknown, limits: TruncateLimits): TruncateResult {
  let bytes = 0;
  try {
    bytes = utf8Bytes(JSON.stringify(value) ?? "null");
  } catch {
    bytes = utf8Bytes(String(value));
  }

  if (!limits.truncateEnabled) {
    return { value, truncated: false, bytes };
  }

  const redact = new Set(limits.redactKeys.map((k) => k.toLowerCase()));
  let truncated = false;

  function walk(v: unknown, keyHint?: string): unknown {
    if (keyHint && isRedactKey(keyHint, [...redact])) {
      if (v !== undefined && v !== null && v !== "") truncated = true;
      return "***";
    }
    if (typeof v === "string") {
      // messages content 用字符上限，其它用字节上限
      if (keyHint === "content" || keyHint === "text" || keyHint === "output") {
        if (v.length > limits.maxMessageChars) {
          truncated = true;
          return `${v.slice(0, limits.maxMessageChars)}…`;
        }
      }
      const t = truncateString(v, limits.maxFieldBytes);
      if (t.truncated) truncated = true;
      return t.text;
    }
    if (typeof v === "number" || typeof v === "boolean" || v == null) return v;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
      truncated = true;
      if (limits.captureBinary === "omit") return undefined;
      return { __binary: true, bytes: v.length };
    }
    if (Array.isArray(v)) {
      // history / messages 条数限制
      if (
        (keyHint === "history" || keyHint === "messages") &&
        limits.maxHistoryMessages > 0 &&
        v.length > limits.maxHistoryMessages
      ) {
        truncated = true;
        const keep = limits.maxHistoryMessages;
        const head = Math.ceil(keep / 2);
        const tail = keep - head;
        const omitted = v.length - keep;
        return [
          ...v.slice(0, head).map((item) => walk(item)),
          { __omitted: omitted, __note: `${omitted} messages omitted` },
          ...v.slice(v.length - tail).map((item) => walk(item)),
        ];
      }
      return v.map((item) => walk(item));
    }
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const next = walk(child, k);
        if (next !== undefined) out[k] = next;
      }
      return out;
    }
    return String(v);
  }

  let next = walk(value);
  try {
    let serialized = JSON.stringify(next) ?? "null";
    if (utf8Bytes(serialized) > limits.maxPayloadBytes) {
      truncated = true;
      // 整体再砍：保留摘要壳
      next = {
        __truncatedPayload: true,
        preview: truncateString(serialized, Math.min(limits.maxFieldBytes, 64_000)).text,
        originalBytes: bytes,
      };
    }
  } catch {
    truncated = true;
    next = { __unserializable: true, originalBytes: bytes };
  }

  return { value: next, truncated, bytes };
}
