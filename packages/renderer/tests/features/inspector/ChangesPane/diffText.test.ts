/**
 * ChangesPane diff 解析纯函数（diffText.ts）。
 */
import assert from "node:assert/strict";
import type { GitChangedFile } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  diffLineKey,
  langFromPath,
  parseUnifiedDiff,
  sortChangedFiles,
} from "../../../../src/features/inspector/ChangesPane/diffText";

function file(path: string, status: string, added: number, removed: number): GitChangedFile {
  return { path, status, added, removed } as GitChangedFile;
}

describe("parseUnifiedDiff", () => {
  it("skips file headers and parses hunk / add / del / ctx with line numbers", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 123..456 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,4 @@",
      " ctx line",
      "-old line",
      "+new line",
      "+another new",
    ].join("\n");
    const rows = parseUnifiedDiff(patch);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[0], { kind: "hunk", text: "@@ -1,3 +1,4 @@" });
    assert.deepEqual(rows[1], { kind: "ctx", text: "ctx line", oldNo: 1, newNo: 1 });
    assert.deepEqual(rows[2], { kind: "del", text: "old line", oldNo: 2, newNo: null });
    assert.deepEqual(rows[3], { kind: "add", text: "new line", oldNo: null, newNo: 2 });
    assert.deepEqual(rows[4], { kind: "add", text: "another new", oldNo: null, newNo: 3 });
  });

  it("inserts a gap row when hunk new-start jumps ahead", () => {
    const patch = ["@@ -1,2 +1,2 @@", " a", " b", "@@ -20,2 +30,2 @@", " c", " d"].join("\n");
    const rows = parseUnifiedDiff(patch);
    const gap = rows.find((r) => r.kind === "gap");
    assert.ok(gap && gap.kind === "gap");
    assert.equal(gap.count, 27);
  });

  it("keeps backslash meta lines and tolerates CRLF", () => {
    const patch = ["@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+b"].join("\r\n");
    const rows = parseUnifiedDiff(patch);
    assert.deepEqual(rows[1], { kind: "del", text: "a", oldNo: 1, newNo: null });
    assert.deepEqual(rows[2], { kind: "meta", text: "\\ No newline at end of file" });
    assert.deepEqual(rows[3], { kind: "add", text: "b", oldNo: null, newNo: 1 });
  });

  it("ignores other non-diff lines", () => {
    const rows = parseUnifiedDiff("random noise\n@@ -1 +1 @@\n+ok");
    assert.equal(rows.length, 2);
  });
});

describe("diffLineKey", () => {
  it("is stable per index", () => {
    assert.equal(diffLineKey(0), "l-0");
    assert.equal(diffLineKey(42), "l-42");
  });
});

describe("langFromPath", () => {
  it("maps known extensions", () => {
    assert.equal(langFromPath("src/a.ts"), "typescript");
    assert.equal(langFromPath("src/a.tsx"), "typescript");
    assert.equal(langFromPath("a.mjs"), "javascript");
    assert.equal(langFromPath("styles.less"), "css");
    assert.equal(langFromPath("a.md"), "markdown");
    assert.equal(langFromPath("a.sh"), "bash");
  });

  it("returns undefined for missing / unknown extensions", () => {
    assert.equal(langFromPath("Makefile"), undefined);
    assert.equal(langFromPath("a.unknownext"), undefined);
    assert.equal(langFromPath("dir.d/file"), undefined);
  });
});

describe("sortChangedFiles", () => {
  it("conflict first, then churn desc, then numeric path", () => {
    const list = [
      file("b.ts", "modified", 1, 1),
      file("a10.ts", "modified", 5, 5),
      file("a2.ts", "conflict", 0, 0),
      file("a9.ts", "modified", 5, 5),
    ];
    const sorted = sortChangedFiles(list).map((f) => f.path);
    assert.deepEqual(sorted, ["a2.ts", "a9.ts", "a10.ts", "b.ts"]);
  });

  it("does not mutate the input", () => {
    const list = [file("b.ts", "modified", 1, 1), file("a.ts", "modified", 9, 9)];
    sortChangedFiles(list);
    assert.deepEqual(
      list.map((f) => f.path),
      ["b.ts", "a.ts"],
    );
  });
});
