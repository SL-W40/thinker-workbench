/**
 * 工作空间读文件：存在 / 缺失路径。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { afterEach, beforeEach, describe, it } from "vitest";
import { listTree, readWorkspaceFile } from "../../src/workspace/fs";

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

function findNode(node: WorkspaceNode, rel: string): WorkspaceNode | undefined {
  if (node.path === rel) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, rel);
    if (found) return found;
  }
  return undefined;
}

describe("listTree", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-tree-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("把 .asar 当成普通文件，而不是归档目录", () => {
    const dir = path.join(root, "release", "win-unpacked", "resources");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "app.asar"), "archive");
    const node = findNode(listTree(root), "release/win-unpacked/resources/app.asar");
    assert.ok(node);
    assert.equal(node.type, "file");
    assert.equal(node.size, Buffer.byteLength("archive"));
  });

  it("遍历结束后恢复 asar 拦截开关", () => {
    const proc = process as NodeJS.Process & { noAsar?: boolean };
    proc.noAsar = false;
    try {
      listTree(root);
      assert.equal(proc.noAsar, false);
    } finally {
      delete proc.noAsar;
    }
  });
});
