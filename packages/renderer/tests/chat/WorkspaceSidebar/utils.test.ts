/**
 * Workspaces 侧栏纯函数（WorkspaceSidebar/utils.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { folderBasename, MORE_LIMIT } from "../../../src/features/chat/WorkspaceSidebar/utils";

describe("folderBasename", () => {
  it("takes the last segment for both separators", () => {
    assert.equal(folderBasename("C:\\work\\my-repo"), "my-repo");
    assert.equal(folderBasename("/home/u/my-repo"), "my-repo");
    assert.equal(folderBasename("C:\\work\\my-repo\\"), "my-repo");
    assert.equal(folderBasename("/home/u/my-repo///"), "my-repo");
  });

  it("falls back to the cleaned path when there is no separator", () => {
    assert.equal(folderBasename("repo"), "repo");
    assert.equal(folderBasename("repo/"), "repo");
    assert.equal(folderBasename(""), "");
  });
});

describe("MORE_LIMIT", () => {
  it("caps the default visible sessions", () => {
    assert.equal(MORE_LIMIT, 8);
  });
});
