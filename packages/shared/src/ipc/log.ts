/**
 * 跨进程日志记录（wire 形态）。
 * 与 `@thinker-workbench/logger` 的 LogRecord 字段对齐，供 utility / renderer IPC 透传。
 */

/** 日志级别（由低到高）。 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 产生日志的进程 / 包角色。 */
export type LogSource = "app" | "desktop" | "agent";

/**
 * 一条可关联的日志。
 * `traceId` 把一次用户发送从 renderer → main → utility 串成同一时间线。
 */
export type LogRecord = {
  level: LogLevel;
  /** 点位名，如 `chat.send`、`runtime.run`、`graph.agent`。 */
  scope: string;
  message: string;
  /** Unix 毫秒。 */
  ts: number;
  source: LogSource;
  /** 端到端会话追踪 id（一次发送一条）。 */
  traceId?: string;
  /** 可选子跨度（节点 / 工具调用）。 */
  spanId?: string;
  threadId?: string;
  runId?: string;
  meta?: Record<string, unknown>;
};
