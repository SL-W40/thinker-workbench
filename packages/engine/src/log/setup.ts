/**
 * Agent 进程日志：仅经回调回推主进程落 SQLite，避免多进程抢写文件。
 */
import {
  configureLog,
  createCallbackSink,
  createLogger,
  type LogRecord,
} from "@thinker-workbench/logger";
import { installLogAls } from "@thinker-workbench/logger/node";

let configured = false;

export type ConfigureAgentLogOptions = {
  /** 是否产出日志；省略则沿用当前进程开关。 */
  enabled?: boolean;
  onRecord: (record: LogRecord) => void;
};

/** 在 hello 时调用一次：安装 ALS + IPC 回调 sink。 */
export function configureAgentLog(options: ConfigureAgentLogOptions): void {
  installLogAls();
  configureLog({
    sinks: [createCallbackSink(options.onRecord)],
    minLevel: "debug",
    ...(typeof options.enabled === "boolean" ? { enabled: options.enabled } : {}),
  });
  configured = true;
  createLogger({ scope: "agent", source: "agent" }).info("log ready", {
    meta: { backend: "parent-sqlite", loggingEnabled: options.enabled ?? null },
  });
}

export function isAgentLogConfigured(): boolean {
  return configured;
}

export function agentLog(scope: string) {
  return createLogger({ scope, source: "agent" });
}
