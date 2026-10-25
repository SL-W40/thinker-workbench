/**
 * Renderer 轻量控制台日志（自研 logger 已移除）。
 */

type LogFn = (msg: string, fields?: Record<string, unknown>) => void;

export type AppLogger = {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
};

export function bootstrapAppLog(): void {
  /* no-op：运行细节走本机 Trace */
}

export function appLog(scope: string): AppLogger {
  const write = (level: string, msg: string, fields?: Record<string, unknown>) => {
    const line = `[app:${scope}] ${msg}`;
    if (level === "error") console.error(line, fields ?? "");
    else if (level === "warn") console.warn(line, fields ?? "");
    else console.info(line, fields ?? "");
  };
  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    debug: (msg, fields) => write("debug", msg, fields),
  };
}
