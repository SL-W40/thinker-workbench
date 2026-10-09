import type { LogRecord, LogSink } from "../types";

/** 把每条记录交给回调（IPC 转发、自定义收集）。 */
export function createCallbackSink(onRecord: (record: LogRecord) => void): LogSink {
  return {
    write(record) {
      onRecord(record);
    },
  };
}
