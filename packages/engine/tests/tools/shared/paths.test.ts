/**
 * 工作区路径：区内相对路径、空路径、区外按访问档位放行。
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { DEFAULT_WORKSPACE_ACCESS } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import {
  isInsideWorkspace,
  resolveWorkspacePath,
  toWorkspaceRelative,
} from "../../../src/tools/shared/paths";
import { setWorkspaceAccess } from "../../../src/workspace";

describe("workspace paths", () => {
  afterEach(() => {
    setWorkspaceAccess(DEFAULT_WORKSPACE_ACCESS);
  });

  it("空路径和 . 锚在根上；相对路径不得用 .. 逃出 workspace 档", () => {
    const root = path.join(os.tmpdir(), "tw-paths-root");
    setWorkspaceAccess("workspace");
    assert.equal(resolveWorkspacePath(root, ""), path.resolve(root));
    assert.equal(resolveWorkspacePath(root, " . "), path.resolve(root));
    assert.equal(resolveWorkspacePath(root, "src/a.ts"), path.resolve(root, "src/a.ts"));
    assert.equal(isInsideWorkspace(root, path.resolve(root, "src")), true);
    assert.throws(
      () => resolveWorkspacePath(root, "../outside.txt", { access: "read" }),
      /Path escapes workspace \(read\)/,
    );
    assert.throws(
      () => resolveWorkspacePath(root, "../outside.txt"),
      /Path escapes workspace \(write\)/,
    );
  });

  it("readOutside 允许读区外绝对路径，写仍然拒绝", () => {
    const root = path.join(os.tmpdir(), "tw-paths-root");
    const outside = path.join(os.tmpdir(), "tw-paths-outside.txt");
    setWorkspaceAccess("readOutside");
    assert.equal(resolveWorkspacePath(root, outside, { access: "read" }), path.resolve(outside));
    assert.throws(
      () => resolveWorkspacePath(root, outside, { access: "write" }),
      /Path escapes workspace \(write\)/,
    );
  });

  it("full 读写都放行；区外展示路径用绝对 posix，区内用相对", () => {
    const root = path.join(os.tmpdir(), "tw-paths-root");
    const outside = path.join(os.tmpdir(), "tw-paths-outside.txt");
    setWorkspaceAccess("full");
    assert.equal(resolveWorkspacePath(root, outside, { access: "write" }), path.resolve(outside));
    assert.equal(toWorkspaceRelative(root, path.resolve(root)), ".");
    assert.equal(toWorkspaceRelative(root, path.resolve(root, "a", "b.ts")), "a/b.ts");
    assert.equal(toWorkspaceRelative(root, outside), path.resolve(outside).replace(/\\/g, "/"));
  });
});
