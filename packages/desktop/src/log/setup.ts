/**
 * 主进程轻量控制台日志（运行细节走本机 Trace）。
 */
import type { LogRecord } from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";

let loggingEnabled = true;

export function setDesktopLogBroadcast(_fn: (record: LogRecord) => void): void {
  /* 已无 renderer 日志广播 */
}

export function configureDesktopLog(): void {
  loggingEnabled = getGeneralSettings().loggingEnabled !== false;
  console.info("[desktop] log ready (console-only)");
}

export function writeAppLogRecord(_record: LogRecord): void {
  /* no-op */
}

export function writeAgentLogRecord(_record: LogRecord): void {
  /* no-op */
}

export function desktopLog(scope: string) {
  const write = (level: string, msg: string, fields?: Record<string, unknown>) => {
    if (!loggingEnabled) return;
    const line = `[desktop:${scope}] ${msg}`;
    if (level === "error") console.error(line, fields ?? "");
    else if (level === "warn") console.warn(line, fields ?? "");
    else console.info(line, fields ?? "");
  };
  return {
    info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
    debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  };
}
