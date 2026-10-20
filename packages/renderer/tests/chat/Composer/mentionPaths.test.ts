/**
 * Composer `@` 候选路径收集（mentionPaths.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { collectMentionPaths, SKILLS_PAGE } from "../../../src/features/chat/Composer/mentionPaths";

describe("collectMentionPaths", () => {
  it("returns empty for null / empty root", () => {
    assert.deepEqual(collectMentionPaths(null), []);
    assert.deepEqual(collectMentionPaths({}), []);
  });

  it("collects files and dirs recursively, normalizing separators", () => {
    const tree = {
      path: ".",
      type: "dir",
      children: [
        { path: "src\\app.ts", type: "file" },
        {
          path: "src",
          type: "dir",
          children: [{ path: "src\\util\\i.ts", type: "file" }],
        },
        { path: "README.md", type: "file" },
        // 类型非 file/dir 的节点跳过（如 symlink）
        { path: "link", type: "symlink" },
      ],
    };
    assert.deepEqual(collectMentionPaths(tree), [
      { path: "src/app.ts", isDir: false },
      { path: "src", isDir: true },
      { path: "src/util/i.ts", isDir: false },
      { path: "README.md", isDir: false },
    ]);
  });
});

describe("SKILLS_PAGE", () => {
  it("pages skills", () => {
    assert.equal(SKILLS_PAGE, 8);
  });
});
