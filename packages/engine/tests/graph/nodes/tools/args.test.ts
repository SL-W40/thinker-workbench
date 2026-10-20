/**
 * tools 节点参数解析与 UI 提示（engine/src/graph/nodes/tools/args.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { fallbackDiff, parseToolArgs, toolUiHints } from "../../../../src/graph/nodes/tools/args";

describe("parseToolArgs", () => {
  it("parses a JSON object", () => {
    const parsed = parseToolArgs('{"a":1}');
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.args : null, { a: 1 });
  });

  it("treats empty input as an empty object", () => {
    const parsed = parseToolArgs("   ");
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.args : null, {});
  });

  it("rejects arrays, scalars and broken JSON", () => {
    assert.equal(parseToolArgs("[1,2]").ok, false);
    assert.equal(parseToolArgs('"text"').ok, false);
    assert.equal(parseToolArgs("null").ok, false);
    assert.equal(parseToolArgs("{oops").ok, false);
  });

  it("truncates long invalid payloads in the error", () => {
    const parsed = parseToolArgs(`{"a":"${"x".repeat(500)}`);
    assert.equal(parsed.ok, false);
    assert.ok(!parsed.ok && parsed.error.length < 260);
  });
});

describe("toolUiHints", () => {
  it("maps browser tools to short paths", () => {
    assert.deepEqual(toolUiHints("browser_navigate", { url: " https://x.dev " }), {
      path: "https://x.dev",
    });
    assert.deepEqual(toolUiHints("browser_snapshot", {}), { path: "snapshot" });
    assert.deepEqual(toolUiHints("browser_screenshot", {}), { path: "screenshot" });
  });

  it("joins pattern / query / glob and truncates commands", () => {
    const hints = toolUiHints("search", { pattern: "a", query: "b", glob: "c" });
    assert.equal(hints.summary, "a · b · c");
    const cmd = toolUiHints("shell", { command: "z".repeat(200) });
    assert.equal((cmd.summary ?? "").length, 80);
  });

  it("adds line ranges, recursive flag and path", () => {
    assert.equal(
      toolUiHints("read_file", { path: "a.ts", start_line: 1, end_line: 9 })?.summary,
      "L1-L9",
    );
    assert.equal(toolUiHints("delete_file", { path: "d", recursive: true })?.summary, "recursive");
    assert.equal(toolUiHints("write_file", { path: "p" })?.path, "p");
  });
});

describe("fallbackDiff", () => {
  it("builds a diff for edit_file when strings differ", () => {
    const diff = fallbackDiff("edit_file", {
      path: "a.ts",
      old_string: "one\ntwo",
      new_string: "one\n2",
    });
    assert.ok(typeof diff === "string" && diff.includes("-two"));
  });

  it("returns undefined for equal strings or missing fields", () => {
    assert.equal(fallbackDiff("edit_file", { old_string: "x", new_string: "x" }), undefined);
    assert.equal(fallbackDiff("edit_file", { old_string: "x" }), undefined);
    assert.equal(fallbackDiff("read_file", { path: "a" }), undefined);
  });

  it("builds a full-file diff for write_file and defaults the path", () => {
    const diff = fallbackDiff("write_file", { contents: "hello" });
    assert.ok(typeof diff === "string" && diff.includes("+hello"));
    assert.ok(diff?.includes("file"));
  });
});
