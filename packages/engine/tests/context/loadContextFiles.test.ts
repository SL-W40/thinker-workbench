/**
 * @ 上下文文件 / 目录注入冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { loadContextFilesBlock } from "../../src/context/loadContextFiles";

describe("loadContextFilesBlock", () => {
  let root = "";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ctx-"));
    fs.mkdirSync(path.join(root, "pkg"));
    fs.writeFileSync(path.join(root, "pkg", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "readme.md"), "# hi\n", "utf8");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("injects file contents", () => {
    const { text } = loadContextFilesBlock(root, ["readme.md"]);
    assert.match(text, /<file path="readme.md">/);
    assert.match(text, /# hi/);
  });

  it("injects directory listing instead of skipping", () => {
    const { text } = loadContextFilesBlock(root, ["pkg/"]);
    assert.match(text, /<directory path="pkg">/);
    assert.match(text, /a\.ts/);
    assert.doesNotMatch(text, /skipped: not a file/);
  });
});
