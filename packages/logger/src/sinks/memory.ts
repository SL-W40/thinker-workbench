import type { LogRecord, LogSink } from "../types";

export type MemorySink = LogSink & {
  readonly records: readonly LogRecord[];
  subscribe(listener: (record: LogRecord) => void): () => void;
  clear(): void;
};

/** 环形内存 sink：供 UI 订阅实时日志。 */
export function createMemorySink(capacity = 500): MemorySink {
  const records: LogRecord[] = [];
  const listeners = new Set<(record: LogRecord) => void>();

  return {
    get records() {
      return records;
    },
    write(record) {
      records.push(record);
      if (records.length > capacity) {
        records.splice(0, records.length - capacity);
      }
      for (const listener of listeners) {
        try {
          listener(record);
        } catch {
          /* ignore */
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      records.length = 0;
    },
  };
}
