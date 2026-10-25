/**
 * RightInspector 标签/路径纯函数（tabs.ts）。
 */
import assert from "node:assert/strict";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  baseName,
  collectFilePaths,
  fileTabKey,
  isDraftTabKey,
  normalizeRelPath,
} from "../../../../src/features/inspector/RightInspector/tabs";

function file(path: string): WorkspaceNode {
  return { name: path, path, type: "file" };
}

function dir(path: string, children: WorkspaceNode[]): WorkspaceNode {
  return { name: path, path, type: "dir", children };
}

describe("collectFilePaths", () => {
  it("returns [] for null", () => {
    assert.deepEqual(collectFilePaths(null), []);
  });

  it("keeps file path, drops root placeholder", () => {
    assert.deepEqual(collectFilePaths(file("a/b.ts")), ["a/b.ts"]);
    assert.deepEqual(collectFilePaths(file(".")), []);
  });

  it("flattens nested dirs", () => {
    const tree = dir(".", [
      dir("src", [file("src/index.ts"), file("src/app.tsx")]),
      file("README.md"),
    ]);
    assert.deepEqual(collectFilePaths(tree), ["src/index.ts", "src/app.tsx", "README.md"]);
  });
});

describe("fileTabKey", () => {
  it("prefixes with file:", () => {
    assert.equal(fileTabKey("a/b.ts"), "file:a/b.ts");
  });
});

describe("baseName", () => {
  it("takes last segment with both separators", () => {
    assert.equal(baseName("a/b/c.ts"), "c.ts");
    assert.equal(baseName("a\\b\\c.ts"), "c.ts");
  });

  it("falls back to raw path when empty", () => {
    assert.equal(baseName("a/"), "a/");
  });
});

describe("normalizeRelPath", () => {
  it("trims, unifies separators and strips leading slash", () => {
    assert.equal(normalizeRelPath("  /a\\b/c.ts "), "a/b/c.ts");
  });
});

describe("isDraftTabKey", () => {
  it("matches draft prefix only", () => {
    assert.equal(isDraftTabKey("draft:1"), true);
    assert.equal(isDraftTabKey("file:a.ts"), false);
  });
});
