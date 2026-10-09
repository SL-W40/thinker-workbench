/**
 * 渲染进程会话日志：本地 memory sink + 经 IPC 由主进程写入 SQLite。
 * 同一 traceId 把前端发送与后端图遍历串在一条时间线上。
 */
import {
  configureLog,
  configureLogPreview,
  createCallbackSink,
  createLogger,
  createMemorySink,
  isLoggingEnabled,
  type LogRecord,
  type MemorySink,
} from "@thinker-workbench/logger";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@thinker-workbench/shared";
import { GENERAL_SETTINGS_CHANGED, onLog } from "../bridge/thinker";

const memory = createMemorySink(800);
let bootstrapped = false;

export function getSessionMemorySink(): MemorySink {
  return memory;
}

/** 按通用设置同步日志总开关与截断策略。 */
function applyAppLogPolicy(general?: GeneralSettings): void {
  const g = general ?? window.thinker?.settings?.getGeneralSync?.() ?? DEFAULT_GENERAL_SETTINGS;
  configureLogPreview({ truncateLongContent: g.logTruncateLongContent });
  configureLog({ enabled: g.loggingEnabled });
}

/** 应用启动时调用一次。 */
export function bootstrapAppLog(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  const general = window.thinker?.settings?.getGeneralSync?.() ?? DEFAULT_GENERAL_SETTINGS;
  configureLog({
    minLevel: "debug",
    enabled: general.loggingEnabled,
    sinks: [
      memory,
      createCallbackSink((record) => {
        try {
          window.thinker?.reportLog?.(record);
        } catch {
          /* preload 未就绪时忽略 */
        }
      }),
    ],
  });
  configureLogPreview({ truncateLongContent: general.logTruncateLongContent });
  createLogger({ scope: "app", source: "app" }).info("log ready");

  // 并入 desktop / agent 广播，便于内存时间线与同进程调试
  onLog(ingestRemoteLog);

  window.addEventListener(GENERAL_SETTINGS_CHANGED, ((event: CustomEvent<GeneralSettings>) => {
    applyAppLogPolicy(event.detail);
  }) as EventListener);
}

export function appLog(scope: string) {
  return createLogger({ scope, source: "app" });
}

/** 把远端（desktop / agent）记录并入同一 memory sink。 */
export function ingestRemoteLog(record: LogRecord): void {
  if (!isLoggingEnabled()) return;
  if (record.source === "app") return;
  memory.write(record);
}
