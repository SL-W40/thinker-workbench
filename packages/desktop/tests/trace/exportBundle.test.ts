/**
 * 会话排查 ZIP：文件齐全、manifest 无密钥、spans 条数正确。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import yauzl from "yauzl";
import {
  buildSessionExportFiles,
  redactKeysDeep,
  writeExportZip,
} from "../../src/trace/exportBundle";

function readZipEntries(zipPath: string): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("no zip"));
        return;
      }
      const out = new Map<string, string>();
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) {
            reject(e2 ?? new Error("no stream"));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(c as Buffer));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zipfile.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zipfile.on("end", () => resolve(out));
      zipfile.on("error", reject);
    });
  });
}

describe("exportBundle", () => {
  it("redactKeysDeep 遮蔽 apiKey", () => {
    const out = redactKeysDeep({
      title: "ok",
      apiKey: "sk-secret",
      nested: { token: "abc", keep: 1 },
    }) as Record<string, unknown>;
    assert.equal(out.apiKey, "***");
    assert.equal((out.nested as { token: string }).token, "***");
    assert.equal((out.nested as { keep: number }).keep, 1);
    assert.equal(out.title, "ok");
  });

  it("ZIP 含约定文件且 spans 条数正确、manifest 无密钥字段值", async () => {
    const spans: TraceSpanRecord[] = [
      {
        spanId: "s1",
        sessionId: "sess_export",
        name: "model.chat",
        kind: "model",
        source: "agent",
        status: "ok",
        startTs: 1,
        endTs: 2,
        attrs: { turn: 1 },
      },
      {
        spanId: "s2",
        sessionId: "sess_export",
        name: "tool:list_dir",
        kind: "tool",
        source: "agent",
        status: "ok",
        startTs: 3,
        endTs: 4,
        attrs: { turn: 1 },
      },
    ];
    const files = buildSessionExportFiles({
      sessionId: "sess_export",
      exportedAt: 1_700_000_000_000,
      appName: "Thinker",
      appVersion: "0.1.0",
      platform: "test",
      spans,
      sessionSummary: {
        sessionId: "sess_export",
        threadId: "th_1",
        workspaceId: "ws_1",
        title: "Demo",
        firstTs: 1,
        lastTs: 4,
        runCount: 1,
      },
      chat: {
        session: {
          id: "sess_export",
          threadId: "th_1",
          workspaceId: "ws_1",
          title: "Demo",
          pinned: false,
          sortOrder: 0,
          runStatus: "idle",
          activeRunId: null,
          interruptReason: null,
          createdAt: 1,
          updatedAt: 4,
        },
        messages: [
          {
            id: "m1",
            role: "user",
            text: "hello",
            createdAt: 1,
            pending: false,
          },
        ],
      },
      workspace: { id: "ws_1", name: "WS", rootPath: "C:/proj" },
      payloadsJsonl:
        '{"id":"pl1","spanId":"s1","side":"out","ts":1,"bytes":2,"truncated":false,"json":{}}\n',
      traceSettings: {
        traceEnabled: true,
        apiKey: "should-not-leak",
        traceTruncateEnabled: true,
      },
    });

    assert.ok(files["manifest.json"]);
    assert.ok(files["trace/spans.json"]);
    assert.ok(files["README.txt"]);
    const manifest = JSON.parse(files["manifest.json"]!) as Record<string, unknown>;
    assert.equal(manifest.sessionId, "sess_export");
    const settings = manifest.traceSettings as Record<string, unknown>;
    assert.equal(settings.apiKey, "***");
    assert.equal(JSON.parse(files["trace/spans.json"]!).length, 2);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-export-"));
    const zipPath = path.join(dir, "out.zip");
    await writeExportZip(files, zipPath);
    const entries = await readZipEntries(zipPath);
    for (const name of [
      "README.txt",
      "manifest.json",
      "session.json",
      "workspace.json",
      "chat/messages.json",
      "trace/spans.json",
      "trace/payloads.jsonl",
      "trace/summary.json",
    ]) {
      assert.ok(entries.has(name), `missing ${name}`);
    }
    assert.equal(JSON.parse(entries.get("trace/spans.json")!).length, 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
