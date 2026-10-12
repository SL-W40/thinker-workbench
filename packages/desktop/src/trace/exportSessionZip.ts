/**
 * 将会话 Trace + 聊天等详细信息打包为 ZIP，供用户反馈排查。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { DEFAULT_TRACE_REDACT_KEYS } from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";
import { getSessionWithMessages, getWorkspace } from "../db/workspacesStore";
import {
  buildSessionExportFiles,
  defaultExportFileName,
  writeExportZip,
  type BuildExportBundleInput,
} from "./exportBundle";
import { sessionJsonlPath } from "./sessionJsonl";
import { listSessionSpans, listSessions } from "./traceDb";

export type ExportSessionResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export {
  buildSessionExportFiles,
  buildTraceSummary,
  redactKeysDeep,
  writeExportZip,
  defaultExportFileName,
} from "./exportBundle";

function collectFromDisk(sessionId: string): BuildExportBundleInput {
  const general = getGeneralSettings();
  const spans = listSessionSpans(sessionId);
  const sessionSummary =
    listSessions({ limit: 500 }).find((s) => s.sessionId === sessionId) ?? null;
  const chat = getSessionWithMessages(sessionId);
  const workspaceId = chat?.session.workspaceId ?? sessionSummary?.workspaceId;
  const ws = workspaceId ? getWorkspace(workspaceId) : null;
  let payloadsJsonl = "";
  try {
    const p = sessionJsonlPath(sessionId);
    if (fs.existsSync(p)) payloadsJsonl = fs.readFileSync(p, "utf8");
  } catch {
    payloadsJsonl = "";
  }
  return {
    sessionId,
    exportedAt: Date.now(),
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    spans,
    sessionSummary,
    chat,
    workspace: ws
      ? { id: ws.id, name: ws.name, rootPath: ws.rootPath }
      : null,
    payloadsJsonl,
    traceSettings: {
      traceEnabled: general.traceEnabled,
      traceTruncateEnabled: general.traceTruncateEnabled,
      traceMaxFieldBytes: general.traceMaxFieldBytes,
      traceMaxPayloadBytes: general.traceMaxPayloadBytes,
      traceMaxMessageChars: general.traceMaxMessageChars,
      traceMaxHistoryMessages: general.traceMaxHistoryMessages,
      traceCaptureBinary: general.traceCaptureBinary,
      traceRetentionDays: general.traceRetentionDays,
      traceMaxSessions: general.traceMaxSessions,
      traceMaxTotalBytes: general.traceMaxTotalBytes,
      traceRedactKeys: general.traceRedactKeys,
    },
    redactKeys: general.traceRedactKeys?.length
      ? general.traceRedactKeys
      : DEFAULT_TRACE_REDACT_KEYS,
  };
}

/**
 * 弹另存对话框并写出会话排查 ZIP。
 * @param browserWindow 可选；有则模态挂到该窗。
 */
export async function exportSessionZip(
  sessionId: string,
  browserWindow?: BrowserWindow | null,
): Promise<ExportSessionResult> {
  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!id) return { ok: false, error: "sessionId required" };

  try {
    const input = collectFromDisk(id);
    if (input.spans?.length === 0 && !input.chat && !input.payloadsJsonl) {
      return { ok: false, error: "No trace or chat data for this session" };
    }
    const files = buildSessionExportFiles(input);
    const defaultPath = path.join(os.homedir(), defaultExportFileName(id));
    const dialogOpts = {
      title: "Export session feedback ZIP",
      defaultPath,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    };
    const result = browserWindow
      ? await dialog.showSaveDialog(browserWindow, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);
    if (result.canceled || !result.filePath) {
      return { ok: false, error: "cancelled" };
    }
    await writeExportZip(files, result.filePath);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
