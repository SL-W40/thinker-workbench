/**
 * 会话排查包内容组装与 ZIP 写入（纯逻辑，供单测与 exportSessionZip 共用）。
 */
import fs from "node:fs";
import path from "node:path";
import {
  type ChatMessage,
  type ChatSessionRecord,
  DEFAULT_TRACE_REDACT_KEYS,
  type TraceSessionSummary,
  type TraceSpanRecord,
  type WorkspaceRecord,
} from "@thinker-workbench/shared";
import yazl from "yazl";

/** 导出包内文本文件映射（路径 → 内容）。 */
export type ExportFileMap = Record<string, string>;

export type BuildExportBundleInput = {
  sessionId: string;
  exportedAt?: number;
  appName?: string;
  appVersion?: string;
  platform?: string;
  spans?: TraceSpanRecord[];
  sessionSummary?: TraceSessionSummary | null;
  chat?: { session: ChatSessionRecord; messages: ChatMessage[] } | null;
  workspace?: Pick<WorkspaceRecord, "id" | "name" | "rootPath"> | null;
  payloadsJsonl?: string;
  /** Trace 截断相关 general 片段（脱敏前）。 */
  traceSettings?: Record<string, unknown>;
  redactKeys?: readonly string[];
};

/** 仅按 key 脱敏（不截断），供 manifest / settings 片段。 */
export function redactKeysDeep(
  value: unknown,
  keys: readonly string[] = DEFAULT_TRACE_REDACT_KEYS,
): unknown {
  const redact = new Set(keys.map((k) => k.toLowerCase()));
  const walk = (v: unknown, keyHint?: string): unknown => {
    if (keyHint && redact.has(keyHint.toLowerCase())) {
      if (v !== undefined && v !== null && v !== "") return "***";
      return v;
    }
    if (Array.isArray(v)) return v.map((item) => walk(item));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(child, k);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/** 从 spans 派生统计摘要。 */
export function buildTraceSummary(spans: TraceSpanRecord[]): Record<string, unknown> {
  const byKind: Record<string, number> = {};
  const byName: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const modelChats: Array<Record<string, unknown>> = [];
  const cancelledOrPartial: Array<Record<string, unknown>> = [];
  const turns = new Map<number, { count: number; names: string[] }>();

  for (const s of spans) {
    byKind[s.runType] = (byKind[s.runType] ?? 0) + 1;
    byName[s.name] = (byName[s.name] ?? 0) + 1;
    const st = s.status ?? "unknown";
    byStatus[st] = (byStatus[st] ?? 0) + 1;

    const turnRaw = s.attrs?.turn;
    const turn =
      typeof turnRaw === "number" && Number.isFinite(turnRaw) ? Math.floor(turnRaw) : undefined;
    if (turn != null && turn > 0) {
      const entry = turns.get(turn) ?? { count: 0, names: [] };
      entry.count += 1;
      if (entry.names.length < 8) entry.names.push(s.name);
      turns.set(turn, entry);
    }

    if (s.name === "model.chat") {
      modelChats.push({
        id: s.id,
        status: s.status,
        turn,
        summary: s.summary,
        startTs: s.startTs,
        endTs: s.endTs,
      });
    }
    if (s.status === "cancelled" || s.status === "error") {
      cancelledOrPartial.push({
        id: s.id,
        name: s.name,
        status: s.status,
        turn,
        summary: s.summary,
      });
    }
  }

  return {
    spanCount: spans.length,
    byKind,
    byName,
    byStatus,
    modelChatCount: modelChats.length,
    modelChats,
    cancelledOrPartial,
    turns: [...turns.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([turn, info]) => ({ turn, ...info })),
  };
}

const README_TXT = [
  "Thinker Workbench — session feedback package",
  "会话排查包 / Session feedback package",
  "",
  "manifest.json — export metadata (no API keys)",
  "session.json — chat session metadata",
  "workspace.json — workspace id / name / rootPath",
  "chat/messages.json — full chat messages for this session",
  "trace/spans.json — span index (Call Tree source)",
  "trace/payloads.jsonl — raw in/out/err payloads",
  "trace/summary.json — derived counts and turn summary",
  "",
  "Do not share if the chat or paths contain secrets you must keep private.",
].join("\n");

/** 组装导出文件内容（纯函数，便于单测）。 */
export function buildSessionExportFiles(input: BuildExportBundleInput): ExportFileMap {
  const sessionId = input.sessionId.trim();
  const exportedAt = input.exportedAt ?? Date.now();
  const spans = input.spans ?? [];
  const summary = input.sessionSummary;
  const redactKeys = input.redactKeys ?? DEFAULT_TRACE_REDACT_KEYS;

  const manifest = redactKeysDeep(
    {
      exportedAt,
      appName: input.appName ?? "Thinker Workbench",
      appVersion: input.appVersion ?? "0.0.0",
      platform: input.platform ?? process.platform,
      sessionId,
      threadId: summary?.threadId ?? input.chat?.session.threadId,
      workspaceId: summary?.workspaceId ?? input.chat?.session.workspaceId,
      title: summary?.title ?? input.chat?.session.title,
      runCount: summary?.runCount ?? 0,
      firstTs: summary?.firstTs,
      lastTs: summary?.lastTs,
      traceSettings: input.traceSettings ?? {},
    },
    redactKeys,
  );

  const sessionJson = input.chat?.session
    ? {
        id: input.chat.session.id,
        threadId: input.chat.session.threadId,
        workspaceId: input.chat.session.workspaceId,
        title: input.chat.session.title,
        pinned: input.chat.session.pinned,
        sortOrder: input.chat.session.sortOrder,
        runStatus: input.chat.session.runStatus,
        activeRunId: input.chat.session.activeRunId,
        interruptReason: input.chat.session.interruptReason,
        createdAt: input.chat.session.createdAt,
        updatedAt: input.chat.session.updatedAt,
      }
    : { id: sessionId, note: "chat session not found" };

  const workspaceJson = input.workspace
    ? {
        id: input.workspace.id,
        name: input.workspace.name,
        rootPath: input.workspace.rootPath,
      }
    : null;

  const messages = input.chat?.messages ?? [];

  return {
    "README.txt": README_TXT,
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "session.json": `${JSON.stringify(sessionJson, null, 2)}\n`,
    "workspace.json": `${JSON.stringify(workspaceJson, null, 2)}\n`,
    "chat/messages.json": `${JSON.stringify(messages, null, 2)}\n`,
    "trace/spans.json": `${JSON.stringify(spans, null, 2)}\n`,
    "trace/payloads.jsonl": input.payloadsJsonl ?? "",
    "trace/summary.json": `${JSON.stringify(buildTraceSummary(spans), null, 2)}\n`,
  };
}

/** 将文件映射写入 ZIP。 */
export async function writeExportZip(files: ExportFileMap, outPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const zipfile = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zipfile.addBuffer(Buffer.from(content, "utf8"), name);
  }
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(outPath);
    stream.on("error", reject);
    stream.on("close", () => resolve());
    zipfile.outputStream.on("error", reject);
    zipfile.outputStream.pipe(stream);
    zipfile.end();
  });
}

/** 默认导出文件名。 */
export function defaultExportFileName(sessionId: string, ts = Date.now()): string {
  const short = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "session";
  const stamp = new Date(ts).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `thinker-trace-${short}-${stamp}.zip`;
}
