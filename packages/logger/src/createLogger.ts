import { getLogContext } from "./context";
import { levelEnabled } from "./levels";
import type { CreateLoggerOptions, LogFields, LogLevel, Logger, LogRecord, LogSink } from "./types";

let sharedSinks: LogSink[] = [];
let sharedMinLevel: LogLevel = "info";
/** 进程级总开关；关闭后 createLogger 不再产出任何记录。 */
let sharedEnabled = true;

/** 进程级默认 sinks / 最低级别 / 总开关（agent / desktop / app 启动或设置变更时配置）。 */
export function configureLog(options: {
  sinks?: LogSink[];
  minLevel?: LogLevel;
  /** 是否产出日志；默认不改动当前值。 */
  enabled?: boolean;
}): void {
  if (options.sinks) sharedSinks = options.sinks;
  if (options.minLevel) sharedMinLevel = options.minLevel;
  if (typeof options.enabled === "boolean") sharedEnabled = options.enabled;
}

export function getSharedSinks(): LogSink[] {
  return sharedSinks;
}

/** 当前进程是否允许产出日志。 */
export function isLoggingEnabled(): boolean {
  return sharedEnabled;
}

function emit(record: LogRecord, sinks: LogSink[]): void {
  for (const sink of sinks) {
    try {
      sink.write(record);
    } catch {
      /* 单个 sink 失败不影响其它 */
    }
  }
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const sinks = options.sinks ?? sharedSinks;
  const minLevel = options.minLevel ?? sharedMinLevel;
  const bound = options.fields ?? {};
  const source = options.source;

  function write(level: LogLevel, message: string, fields?: LogFields): void {
    if (!sharedEnabled) return;
    if (!levelEnabled(minLevel, level)) return;
    const ctx = getLogContext();
    const record: LogRecord = {
      level,
      scope: options.scope,
      message,
      ts: Date.now(),
      source: ctx.source ?? source,
      traceId: fields?.traceId ?? bound.traceId ?? ctx.traceId,
      spanId: fields?.spanId ?? bound.spanId ?? ctx.spanId,
      threadId: fields?.threadId ?? bound.threadId ?? ctx.threadId,
      runId: fields?.runId ?? bound.runId ?? ctx.runId,
      meta:
        fields?.meta || bound.meta ? { ...(bound.meta ?? {}), ...(fields?.meta ?? {}) } : undefined,
    };
    emit(record, sinks.length ? sinks : sharedSinks);
  }

  const logger: Logger = {
    scope: options.scope,
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child(scope, fields) {
      return createLogger({
        scope: `${options.scope}.${scope}`,
        source,
        sinks,
        minLevel,
        fields: { ...bound, ...fields },
      });
    },
  };
  return logger;
}
