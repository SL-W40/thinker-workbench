import { formatLogLine } from "../format";
import type { LogSink } from "../types";

/** 可选终端 sink；默认关闭，避免依赖 `pnpm run dev` 终端。 */
export function createConsoleSink(): LogSink {
  return {
    write(record) {
      const line = formatLogLine(record);
      if (record.level === "error") {
        console.error(line);
      } else if (record.level === "warn") {
        console.warn(line);
      } else {
        console.log(line);
      }
    },
  };
}
