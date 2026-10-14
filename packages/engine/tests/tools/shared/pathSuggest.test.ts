/**
 * 路径候选：后缀重合打分与缺失文件文案。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
  formatMissingFileError,
  scorePathSuggestion,
  suggestPathsByBasename,
} from "../../../src/tools/shared/pathSuggest";

describe("scorePathSuggestion", () => {
  it("共享尾部段越多分越高；无关路径为 -1", () => {
    assert.ok(
      scorePathSuggestion("src/parse/blocks.ts", "pkg/src/parse/blocks.ts") >
        scorePathSuggestion("src/parse/blocks.ts", "other/blocks.ts"),
    );
    assert.equal(scorePathSuggestion("a.ts", "b/c.ts"), -1);
  });
});

describe("formatMissingFileError", () => {
  it("无候选时提示先搜；有候选时列出 Did you mean", () => {
    assert.match(formatMissingFileError("a.ts", []), /File not found: a\.ts/);
    assert.match(formatMissingFileError("a.ts", []), /do not guess/);
    const withHits = formatMissingFileError("src/a.ts", ["pkg/src/a.ts"]);
    assert.match(withHits, /Did you mean:/);
    assert.match(withHits, /- pkg\/src\/a\.ts/);
  });
});

describe("suggestPathsByBasename", () => {
  it("按 basename 找到文件，并把后缀更贴的排前面", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tw-suggest-"));
    fs.mkdirSync(path.join(root, "pkg", "src", "parse"), { recursive: true });
    fs.mkdirSync(path.join(root, "other"), { recursive: true });
    fs.writeFileSync(path.join(root, "pkg", "src", "parse", "blocks.ts"), "x", "utf8");
    fs.writeFileSync(path.join(root, "other", "blocks.ts"), "y", "utf8");

    const hits = await suggestPathsByBasename({
      workspaceRoot: root,
      requestedRel: "src/parse/blocks.ts",
      basename: "blocks.ts",
      signal: new AbortController().signal,
    });

    assert.equal(hits[0], "pkg/src/parse/blocks.ts");
    assert.ok(hits.includes("other/blocks.ts"));
  });
});
