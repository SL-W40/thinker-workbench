/**
 * 产品工具窗数据 IPC：日志 meta/traces/query。
 */

import { IpcChannels, type LogsQuery } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { logsMeta, logsQuery, logsTraces } from "../tools/logsContent";

/** 注册 tools:* invoke handlers。 */
export function registerToolsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.toolsLogsMeta, () => logsMeta());

  ipcMain.handle(IpcChannels.toolsLogsTraces, (_evt, limit: unknown) => {
    const n = typeof limit === "number" && Number.isFinite(limit) ? limit : 60;
    return logsTraces(n);
  });

  ipcMain.handle(IpcChannels.toolsLogsQuery, (_evt, query: unknown) => {
    const q = (query && typeof query === "object" ? query : {}) as LogsQuery;
    if (typeof q.file !== "string" || !q.file.trim()) {
      return logsQuery({ ...q, file: "all" });
    }
    return logsQuery(q);
  });
}
