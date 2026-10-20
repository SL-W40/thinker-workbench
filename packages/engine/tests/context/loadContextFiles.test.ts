/**
 * @ 上下文文件 / 目录 / 外部附件注入测试（Vitest）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import { afterAll, beforeAll, describe, it } from "vitest";
import { loadContextFilesBlock } from "../../src/context/loadContextFiles";

describe("loadContextFilesBlock", () => {
  let root = "";
  let attPath = "";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ctx-"));
    fs.mkdirSync(path.join(root, "pkg"));
    fs.writeFileSync(path.join(root, "pkg", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "readme.md"), "# hi\n", "utf8");
    // 外部附件落盘（dataDir/attachments 模拟）
    attPath = path.join(root, "att-abc123.txt");
    fs.writeFileSync(attPath, "attachment body text\nsecond line\n", "utf8");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("injects workspace file contents", async () => {
    const { text } = await loadContextFilesBlock(root, ["readme.md"]);
    assert.match(text, /<file path="readme.md">/);
    assert.match(text, /# hi/);
  });

  it("injects directory listing instead of skipping", async () => {
    const { text } = await loadContextFilesBlock(root, ["pkg/"]);
    assert.match(text, /<directory path="pkg">/);
    assert.match(text, /a\.ts/);
    assert.doesNotMatch(text, /skipped: not a file/);
  });

  it("parses external attachments into the same context block", async () => {
    const att: ChatAttachmentRef = {
      id: "abc123",
      name: "report.txt",
      path: attPath,
      mime: "text/plain",
      size: fs.statSync(attPath).size,
      kind: "other",
    };
    const { text } = await loadContextFilesBlock(root, undefined, [att]);
    assert.match(text, /<file path="file:abc123" name="report.txt">/);
    assert.match(text, /attachment body text/);
  });

  it("skips missing attachments without throwing", async () => {
    const att: ChatAttachmentRef = {
      id: "missing",
      name: "gone.txt",
      path: path.join(root, "does-not-exist.txt"),
      mime: "text/plain",
      size: 0,
      kind: "other",
    };
    const { text } = await loadContextFilesBlock(root, undefined, [att]);
    assert.match(text, /file:missing/);
    assert.match(text, /skipped: not found/);
  });
});
