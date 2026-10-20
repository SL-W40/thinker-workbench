/**
 * 悬停预览纯函数单测（Vitest）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  formatFileSize,
  summarizeTextPreview,
} from "../../../src/features/chat/mentionPreviewFormat";

describe("formatFileSize", () => {
  it("returns 0 B for invalid/negative input", () => {
    assert.equal(formatFileSize(-1), "0 B");
    assert.equal(formatFileSize(Number.NaN), "0 B");
    assert.equal(formatFileSize(Number.POSITIVE_INFINITY), "0 B");
  });

  it("formats bytes without decimal", () => {
    assert.equal(formatFileSize(0), "0 B");
    assert.equal(formatFileSize(512), "512 B");
  });

  it("formats KB/MB/GB with one decimal", () => {
    assert.equal(formatFileSize(1024), "1.0 KB");
    assert.equal(formatFileSize(1536), "1.5 KB");
    assert.equal(formatFileSize(1024 * 1024), "1.0 MB");
    assert.equal(formatFileSize(1024 * 1024 * 1024), "1.0 GB");
    assert.equal(formatFileSize(1024 * 1024 * 1024 * 2.5), "2.5 GB");
  });
});

describe("summarizeTextPreview", () => {
  it("returns empty string for empty content", () => {
    assert.equal(summarizeTextPreview("", 100, 10), "");
  });

  it("keeps short single-line text intact", () => {
    assert.equal(summarizeTextPreview("hello", 100, 10), "hello");
  });

  it("truncates by lines then by chars", () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const out = summarizeTextPreview(content, 1000, 5);
    assert.equal(out.split("\n").length, 6); // 5 lines + ellipsis marker
    assert.ok(out.endsWith("…"));
  });

  it("truncates long lines by maxChars", () => {
    const out = summarizeTextPreview("a".repeat(500), 120, 10);
    assert.ok(out.length <= 120 + 2);
    assert.ok(out.endsWith("…"));
  });

  it("does not mutate the original trailing whitespace awkwardly", () => {
    const out = summarizeTextPreview("abc".repeat(50), 10, 10);
    assert.ok(out.startsWith("abc"));
  });
});
