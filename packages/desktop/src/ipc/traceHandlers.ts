/**
 * 会话 Trace IPC：列表 / spans / payload / start-end / 删除 / 导出。
 */

import {
  IpcChannels,
  type TraceEndSpanRequest,
  type TraceListSessionsQuery,
  type TraceStartSpanRequest,
} from "@thinker-workbench/shared";
import { BrowserWindow, type IpcMain } from "electron";
import { markSessionArtifactsPurged } from "../db/sessionArtifacts";
import { exportSessionZip } from "../trace/exportSessionZip";
import { readPayload, removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession, listSessionSpans, listSessions } from "../trace/traceDb";
import { resolveWorkspaceIdForSession } from "../trace/workspaceTraceDb";
import { handleEndSpan, handleStartSpan } from "../trace/writeSpan";

/** 与其它 handler 保持一致：由 registerIpc 注入 ipcMain，不在模块里直接抓 Electron 单例。 */
export function registerTraceHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.traceListSessions, (_e, query?: TraceListSessionsQuery) =>
    listSessions(query ?? {}),
  );
  ipcMain.handle(IpcChannels.traceGetSessionSpans, (_e, sessionId: string) => {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) return [];
    const workspaceId = resolveWorkspaceIdForSession(id);
    return workspaceId ? listSessionSpans(workspaceId, id) : [];
  });
  ipcMain.handle(IpcChannels.traceGetPayload, (_e, sessionId: string, payloadId: string) => {
    if (typeof sessionId !== "string" || typeof payloadId !== "string") return null;
    const id = sessionId.trim();
    const workspaceId = resolveWorkspaceIdForSession(id);
    return workspaceId ? readPayload(workspaceId, id, payloadId.trim()) : null;
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
    const workspaceId = resolveWorkspaceIdForSession(id);
    if (!workspaceId) return;
    deleteSession(workspaceId, id);
    removeSessionJsonl(workspaceId, id);
  });
  ipcMain.handle(IpcChannels.traceExportSession, async (evt, sessionId: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    return exportSessionZip(typeof sessionId === "string" ? sessionId : "", win);
  });
}
