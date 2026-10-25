/**
 * 将会话 Trace + 聊天等详细信息打包为 ZIP，供用户反馈排查。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_TRACE_REDACT_KEYS } from "@thinker-workbench/shared";
import { app, type BrowserWindow, dialog } from "electron";
import { getGeneralSettings } from "../config/settingsStore";
import { getSessionWithMessages, getWorkspace } from "../db/workspacesStore";
import {
  type BuildExportBundleInput,
  buildSessionExportFiles,
  defaultExportFileName,
  writeExportZip,
} from "./exportBundle";
import { sessionJsonlPath } from "./sessionJsonl";
import { listSessionSpans, listSessions } from "./traceDb";
import { resolveWorkspaceIdForSession } from "./workspaceTraceDb";

export type ExportSessionResult = { ok: true; path: string } | { ok: false; error: string };

export {
  buildSessionExportFiles,
  buildTraceSummary,
  defaultExportFileName,
  redactKeysDeep,
  writeExportZip,
} from "./exportBundle";

function collectFromDisk(sessionId: string): BuildExportBundleInput {
  const general = getGeneralSettings();
  const chat = getSessionWithMessages(sessionId);
  // Trace 分库后必须先定位工作区，否则 span 与 payload 都取不到
  const workspaceId =
    chat?.session.workspaceId ??
    resolveWorkspaceIdForSession(sessionId) ??
    listSessions({ limit: 500 }).find((s) => s.sessionId === sessionId)?.workspaceId ??
    null;
  const spans = workspaceId ? listSessionSpans(workspaceId, sessionId) : [];
  const sessionSummary =
    listSessions({ limit: 500, workspaceId: workspaceId ?? undefined }).find(
      (s) => s.sessionId === sessionId,
    ) ?? null;
  const ws = workspaceId ? getWorkspace(workspaceId) : null;
  let payloadsJsonl = "";
  try {
    const p = workspaceId ? sessionJsonlPath(workspaceId, sessionId) : "";
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
    workspace: ws ? { id: ws.id, name: ws.name, rootPath: ws.rootPath } : null,
    payloadsJsonl,
    traceSettings: {
      observabilityEnabled: general.observabilityEnabled,
    },
    redactKeys: [...DEFAULT_TRACE_REDACT_KEYS],
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
