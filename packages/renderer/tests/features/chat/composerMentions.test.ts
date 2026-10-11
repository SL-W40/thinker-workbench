/**
 * Composer mention 解析冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  detectActiveMention,
  extractContextPaths,
  parseMentionSegments,
} from "../../../src/features/chat/composerMentions";

describe("detectActiveMention", () => {
  it("triggers on bare @ after whitespace", () => {
    const m = detectActiveMention("say @", 5);
    assert.equal(m?.kind, "at");
    assert.equal(m?.query, "");
  });

  it("ends when query contains a space", () => {
    assert.equal(detectActiveMention("say @ ", 6), null);
    assert.equal(detectActiveMention("@foo bar", 8), null);
  });
});

describe("extractContextPaths", () => {
  it("strips trailing slash from directory mentions", () => {
    assert.deepEqual(extractContextPaths("see @src/ "), ["src"]);
    assert.deepEqual(extractContextPaths("see @`my dir/` please"), ["my dir"]);
  });
});

describe("parseMentionSegments", () => {
  it("keeps directory chips that end with /", () => {
    const segs = parseMentionSegments("look @src/ next", "display");
    const at = segs.find((s) => s.kind === "at");
    assert.ok(at && at.kind === "at");
    assert.equal(at.path, "src/");
  });
});
