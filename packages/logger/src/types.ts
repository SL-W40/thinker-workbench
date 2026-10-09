import type { LogLevel, LogRecord, LogSource } from "@thinker-workbench/shared";

export type { LogLevel, LogRecord, LogSource };

/** 写入一条日志时的可选关联字段与结构化附加数据。 */
export type LogFields = {
  traceId?: string;
  spanId?: string;
  threadId?: string;
  runId?: string;
  meta?: Record<string, unknown>;
};

/** 当前异步 / 同步栈上的关联上下文（由 withLogContext 注入）。 */
export type LogContext = {
  source?: LogSource;
  traceId?: string;
  spanId?: string;
  threadId?: string;
  runId?: string;
};

export type LogSink = {
  write(record: LogRecord): void;
};

export type Logger = {
  readonly scope: string;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** 派生子 scope（`parent.child`），继承 binder 字段。 */
  child(scope: string, fields?: LogFields): Logger;
};

export type CreateLoggerOptions = {
  scope: string;
  source: LogSource;
  sinks?: LogSink[];
  /** 默认 info。 */
  minLevel?: LogLevel;
  /** 固化到每条记录上的关联字段。 */
  fields?: LogFields;
};
