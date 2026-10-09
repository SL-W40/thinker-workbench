import fs from "node:fs";
import path from "node:path";
import { formatLogLine } from "../format";
import type { LogSink } from "../types";

export type FileSinkOptions = {
  /** 日志文件绝对路径。 */
  filePath: string;
};

/** 追加写入文件的 sink（仅 Node）。 */
export function createFileSink(options: FileSinkOptions): LogSink {
  const filePath = options.filePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  return {
    write(record) {
      fs.appendFileSync(filePath, `${formatLogLine(record)}\n`, "utf8");
    },
  };
}
