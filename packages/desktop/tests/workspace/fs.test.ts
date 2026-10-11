/**
 * 工作空间读文件：存在 / 缺失路径。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { readWorkspaceFile } from "../../src/workspace/fs";

describe("readWorkspaceFile", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-fs-"));
    fs.writeFileSync(path.join(root, "hello.txt"), "hi", "utf8");
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("读得到文本文件", () => {
    const file = readWorkspaceFile(root, "hello.txt");
    assert.equal(file.missing, undefined);
    assert.equal(file.content, "hi");
    assert.equal(file.editable, true);
  });

  it("缺失路径返回 missing，不抛错", () => {
    const file = readWorkspaceFile(root, "gone.txt");
    assert.equal(file.missing, true);
    assert.equal(file.content, "");
    assert.equal(file.path, "gone.txt");
  });

  it("目录路径也视为 missing", () => {
    fs.mkdirSync(path.join(root, "subdir"));
    const file = readWorkspaceFile(root, "subdir");
    assert.equal(file.missing, true);
  });
});
