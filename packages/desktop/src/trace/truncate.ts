/**
 * Trace 载荷截断 / 脱敏（Main 落盘前统一执行）。
 */
import {
  DEFAULT_TRACE_MAX_FIELD_BYTES,
  DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
  DEFAULT_TRACE_MAX_MESSAGE_CHARS,
  DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
  DEFAULT_TRACE_REDACT_KEYS,
} from "@thinker-workbench/shared";

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

/** Local 后端使用内置默认截断策略（不再占用 GeneralSettings）。 */
export function limitsFromGeneral(): TruncateLimits {
  return {
    truncateEnabled: true,
    maxFieldBytes: DEFAULT_TRACE_MAX_FIELD_BYTES,
    maxPayloadBytes: DEFAULT_TRACE_MAX_PAYLOAD_BYTES,
    maxMessageChars: DEFAULT_TRACE_MAX_MESSAGE_CHARS,
    maxHistoryMessages: DEFAULT_TRACE_MAX_HISTORY_MESSAGES,
    captureBinary: "meta",
    redactKeys: [...DEFAULT_TRACE_REDACT_KEYS],
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
 * 递归截断 / 脱敏任意 JSON 值。
 */
export function truncateForTrace(value: unknown, limits: TruncateLimits): TruncateResult {
  if (!limits.truncateEnabled) {
    const json = JSON.stringify(value);
    return { value, truncated: false, bytes: utf8Bytes(json ?? "null") };
  }

  let truncated = false;

  const walk = (v: unknown, depth: number): unknown => {
    if (v == null) return v;
    if (typeof v === "string") {
      const r = truncateString(v, limits.maxFieldBytes);
      if (r.truncated) truncated = true;
      return r.text;
    }
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
      truncated = true;
      return limits.captureBinary === "omit" ? undefined : { __binary: true, bytes: v.byteLength };
    }
    if (Array.isArray(v)) {
      const maxItems = Math.min(v.length, limits.maxHistoryMessages);
      if (v.length > maxItems) truncated = true;
      return v.slice(0, maxItems).map((item) => walk(item, depth + 1));
    }
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (isRedactKey(k, limits.redactKeys)) {
          out[k] = "[redacted]";
          truncated = true;
          continue;
        }
        out[k] = walk(val, depth + 1);
      }
      return out;
    }
    return String(v);
  };

  let next = walk(value, 0);
  let json = JSON.stringify(next) ?? "null";
  if (utf8Bytes(json) > limits.maxPayloadBytes) {
    truncated = true;
    next = {
      __truncated: true,
      preview: truncateString(json, Math.min(limits.maxFieldBytes, limits.maxPayloadBytes)).text,
    };
    json = JSON.stringify(next) ?? "null";
  }
  return { value: next, truncated, bytes: utf8Bytes(json) };
}
