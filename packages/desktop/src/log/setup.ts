/**
 * 主进程日志：写入 SQLite 按条数滚动分片，并经回调推到 renderer。
 * app / agent 记录经 IPC 汇总到主进程再落库，避免多进程抢写。
 */
import {
  configureLog,
  configureLogPreview,
  createCallbackSink,
  createLogger,
  isLoggingEnabled,
  type LogRecord,
} from "@thinker-workbench/logger";
import { installLogAls } from "@thinker-workbench/logger/node";
import { getLogDir } from "../config/paths";
import { getGeneralSettings } from "../config/settingsStore";
import { insertLogRecord } from "./logsDb";

let broadcast: ((record: LogRecord) => void) | null = null;

/** 由 IPC 注册处挂上「广播到所有窗口」的回调。 */
export function setDesktopLogBroadcast(fn: (record: LogRecord) => void): void {
  broadcast = fn;
}

function sqliteSinkWrite(record: LogRecord): void {
  try {
    insertLogRecord(record);
  } catch {
    /* 落库失败不拖垮主进程 */
  }
}

export function configureDesktopLog(): void {
  installLogAls();
  const general = getGeneralSettings();
  const logDir = getLogDir();
  configureLog({
    minLevel: "debug",
    enabled: general.loggingEnabled,
    sinks: [
      createCallbackSink((record) => {
        sqliteSinkWrite(record);
        broadcast?.(record);
      }),
    ],
  });
  configureLogPreview({
    truncateLongContent: general.logTruncateLongContent,
  });
  createLogger({ scope: "desktop", source: "desktop" }).info("log ready", {
    meta: {
      logDir,
      backend: "sqlite-count-shards",
      loggingEnabled: general.loggingEnabled,
      logTruncateLongContent: general.logTruncateLongContent,
      logRetentionDays: general.logRetentionDays,
    },
  });
}

/** 写入 renderer / agent 上报的 LogRecord（落库；app 不回推，agent 可回推）。 */
export function writeAppLogRecord(record: LogRecord): void {
  if (!isLoggingEnabled()) return;
  if (!record || typeof record !== "object") return;
  if (typeof record.message !== "string" || typeof record.scope !== "string") return;
  if (typeof record.ts !== "number") return;
  sqliteSinkWrite({
    ...record,
    source: record.source === "agent" ? "agent" : "app",
  });
}

/** agent 经 bridge 上来的日志：落库 + 广播。 */
export function writeAgentLogRecord(record: LogRecord): void {
  if (!isLoggingEnabled()) return;
  if (!record || typeof record !== "object") return;
  if (typeof record.message !== "string" || typeof record.scope !== "string") return;
  if (typeof record.ts !== "number") return;
  const next: LogRecord = { ...record, source: "agent" };
  sqliteSinkWrite(next);
  broadcast?.(next);
}

export function desktopLog(scope: string) {
  return createLogger({ scope, source: "desktop" });
}
