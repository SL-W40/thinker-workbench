/**
 * 工作空间读文件：存在 / 缺失路径。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  createWorkspaceDir,
  deleteWorkspacePath,
  listTree,
  readWorkspaceFile,
  renameWorkspacePath,
  workspaceAbsPath,
} from "../../src/workspace/fs";

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

describe("工作空间写操作", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-write-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("新建目录会递归创建父级", () => {
    createWorkspaceDir(root, "a/b/c");
    assert.equal(fs.statSync(path.join(root, "a/b/c")).isDirectory(), true);
  });

  it("重复新建同名目录报错，不静默复用", () => {
    createWorkspaceDir(root, "dup");
    assert.throws(() => createWorkspaceDir(root, "dup"), /Already exists/);
  });

  it("新建目录拒绝越界路径", () => {
    assert.throws(() => createWorkspaceDir(root, "../escape"), /escapes workspace/);
  });

  it("重命名文件", () => {
    fs.writeFileSync(path.join(root, "a.txt"), "x");
    renameWorkspacePath(root, "a.txt", "b.txt");
    assert.equal(fs.existsSync(path.join(root, "a.txt")), false);
    assert.equal(fs.readFileSync(path.join(root, "b.txt"), "utf8"), "x");
  });

  it("重命名目标已存在时拒绝覆盖", () => {
    fs.writeFileSync(path.join(root, "a.txt"), "x");
    fs.writeFileSync(path.join(root, "b.txt"), "y");
    assert.throws(() => renameWorkspacePath(root, "a.txt", "b.txt"), /Already exists/);
    assert.equal(fs.readFileSync(path.join(root, "b.txt"), "utf8"), "y");
  });

  it("重命名源不存在时报错", () => {
    assert.throws(() => renameWorkspacePath(root, "nope.txt", "b.txt"), /Not found/);
  });

  it("重命名拒绝越界目标", () => {
    fs.writeFileSync(path.join(root, "a.txt"), "x");
    assert.throws(() => renameWorkspacePath(root, "a.txt", "../moved.txt"), /escapes workspace/);
  });

  it("删除目录是递归的", () => {
    createWorkspaceDir(root, "dir/inner");
    fs.writeFileSync(path.join(root, "dir/inner/x.txt"), "x");
    deleteWorkspacePath(root, "dir");
    assert.equal(fs.existsSync(path.join(root, "dir")), false);
  });

  it("拒绝删除工作空间根", () => {
    assert.throws(() => deleteWorkspacePath(root, "."), /workspace root/);
    assert.throws(() => deleteWorkspacePath(root, ""), /workspace root/);
  });

  it("删除不存在的路径是幂等的", () => {
    deleteWorkspacePath(root, "gone.txt");
    assert.equal(fs.existsSync(path.join(root, "gone.txt")), false);
  });

  it("workspaceAbsPath 返回绝对路径并拦住越界", () => {
    assert.equal(workspaceAbsPath(root, "a.txt"), path.join(path.resolve(root), "a.txt"));
    assert.throws(() => workspaceAbsPath(root, "../x"), /escapes workspace/);
  });
});
