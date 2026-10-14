/**
 * 进程级工作区根与删除开关（无 RunContext 时的回退）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
  getAllowAiDeleteFiles,
  getWorkspaceName,
  getWorkspaceRoot,
  getWorkspaceRootOrNull,
  setAllowAiDeleteFiles,
  setWorkspaceRoot,
} from "../../src/workspace";

describe("workspace root", () => {
  it("空值清空后抛错；不存在的路径拒绝；合法目录记下显示名", () => {
    assert.throws(() => setWorkspaceRoot("  "), /required/);
    assert.equal(getWorkspaceRootOrNull(), null);
    assert.equal(getWorkspaceName(), null);
    assert.throws(() => getWorkspaceRoot(), /No workspace root/);

    const missing = path.join(os.tmpdir(), "tw-missing-workspace-root");
    assert.throws(() => setWorkspaceRoot(missing), /does not exist/);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-ws-"));
    assert.equal(setWorkspaceRoot(dir), path.resolve(dir));
    assert.equal(getWorkspaceRoot(), path.resolve(dir));
    assert.equal(getWorkspaceName(), path.basename(dir));
    setWorkspaceRoot(dir, { name: " 别名 " });
    assert.equal(getWorkspaceName(), "别名");

    const file = path.join(dir, "not-dir.txt");
    fs.writeFileSync(file, "x");
    assert.throws(() => setWorkspaceRoot(file), /does not exist/);
  });

  it("删除开关只在传入布尔时改变", () => {
    const before = getAllowAiDeleteFiles();
    assert.equal(setAllowAiDeleteFiles(null), before);
    assert.equal(setAllowAiDeleteFiles(false), false);
    assert.equal(getAllowAiDeleteFiles(), false);
    setAllowAiDeleteFiles(true);
  });
});
