/**
 * 会话 Trace IPC：列表 / spans / payload / start-end / 删除 / 导出。
 */

import {
  IpcChannels,
  type TraceEndSpanRequest,
  type TraceListSessionsQuery,
  type TraceStartSpanRequest,
} from "@thinker-workbench/shared";
import { BrowserWindow, ipcMain } from "electron";
import { markSessionArtifactsPurged } from "../db/sessionArtifacts";
import { exportSessionZip } from "../trace/exportSessionZip";
import { readPayload, removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession, listSessionSpans, listSessions } from "../trace/traceDb";
import { handleEndSpan, handleStartSpan } from "../trace/writeSpan";

export function registerTraceHandlers(): void {
  ipcMain.handle(IpcChannels.traceListSessions, (_e, query?: TraceListSessionsQuery) =>
    listSessions(query ?? {}),
  );
  ipcMain.handle(IpcChannels.traceGetSessionSpans, (_e, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) return [];
    return listSessionSpans(sessionId.trim());
  });
  ipcMain.handle(IpcChannels.traceGetPayload, (_e, sessionId: string, payloadId: string) => {
    if (typeof sessionId !== "string" || typeof payloadId !== "string") return null;
    return readPayload(sessionId.trim(), payloadId.trim());
  });
  ipcMain.handle(IpcChannels.traceStartSpan, (_e, req: TraceStartSpanRequest) =>
    handleStartSpan(req),
  );
  ipcMain.handle(IpcChannels.traceEndSpan, async (_e, req: TraceEndSpanRequest) => {
    handleEndSpan(req);
  });
  ipcMain.handle(IpcChannels.traceDeleteSession, (_e, sessionId: string) => {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) return;
    markSessionArtifactsPurged(id);
    deleteSession(id);
    removeSessionJsonl(id);
  });
  ipcMain.handle(IpcChannels.traceExportSession, async (evt, sessionId: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    return exportSessionZip(typeof sessionId === "string" ? sessionId : "", win);
  });
}
