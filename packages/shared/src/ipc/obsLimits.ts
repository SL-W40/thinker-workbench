/**
 * 本机 Trace 截断 / 保留默认值。
 */

export const DEFAULT_TRACE_REDACT_KEYS = [
  "authorization",
  "apiKey",
  "api_key",
  "token",
  "password",
  "secret",
] as const;

export const DEFAULT_TRACE_MAX_FIELD_BYTES = 262_144;
export const DEFAULT_TRACE_MAX_PAYLOAD_BYTES = 1_048_576;
export const DEFAULT_TRACE_MAX_MESSAGE_CHARS = 100_000;
export const DEFAULT_TRACE_MAX_HISTORY_MESSAGES = 200;
export const DEFAULT_TRACE_MAX_SESSIONS = 200;
export const DEFAULT_TRACE_MAX_TOTAL_BYTES = 5_368_709_120;
export const DEFAULT_TRACE_RETENTION_DAYS = 30;
