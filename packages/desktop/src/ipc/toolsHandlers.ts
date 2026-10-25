/**
 * 产品工具窗数据 IPC：日志 meta/traces/query。
 */

import { IpcChannels, type LogsQuery } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { logsMeta, logsQuery, logsTraces } from "../tools/logsContent";
import { normalizeLimit, normalizeLogsQuery } from "./normalize";

/** 注册 tools:* invoke handlers。 */
export function registerToolsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.toolsLogsMeta, () => logsMeta());

  ipcMain.handle(IpcChannels.toolsLogsTraces, (_evt, limit: unknown) =>
    logsTraces(normalizeLimit(limit)),
  );

  ipcMain.handle(IpcChannels.toolsLogsQuery, (_evt, query: unknown) =>
    logsQuery(normalizeLogsQuery<LogsQuery>(query)),
  );
}
