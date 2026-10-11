/**
 * 会话 Trace IPC：列表 / spans / payload / start-end / 删除。
 */
import { ipcMain } from "electron";
import {
  IpcChannels,
  type TraceEndSpanRequest,
  type TraceListSessionsQuery,
  type TraceStartSpanRequest,
} from "@thinker-workbench/shared";
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
  ipcMain.handle(
    IpcChannels.traceGetPayload,
    (_e, sessionId: string, payloadId: string) => {
      if (typeof sessionId !== "string" || typeof payloadId !== "string") return null;
      return readPayload(sessionId.trim(), payloadId.trim());
    },
  );
  ipcMain.handle(IpcChannels.traceStartSpan, (_e, req: TraceStartSpanRequest) =>
    handleStartSpan(req),
  );
  ipcMain.handle(IpcChannels.traceEndSpan, async (_e, req: TraceEndSpanRequest) => {
    handleEndSpan(req);
  });
  ipcMain.handle(IpcChannels.traceDeleteSession, (_e, sessionId: string) => {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) return;
    deleteSession(id);
    removeSessionJsonl(id);
  });
}
