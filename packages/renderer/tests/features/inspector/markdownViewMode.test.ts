/**
 * Markdown 查看模式偏好（markdownViewMode.ts，jsdom localStorage）。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  loadMarkdownViewMode,
  MARKDOWN_VIEW_MODE_KEY,
  saveMarkdownViewMode,
} from "../../../src/features/inspector/markdownViewMode";

afterEach(() => {
  localStorage.removeItem(MARKDOWN_VIEW_MODE_KEY);
});

describe("loadMarkdownViewMode", () => {
  it("未设置或非法值时回退到编辑", () => {
    assert.equal(loadMarkdownViewMode(), "edit");
    localStorage.setItem(MARKDOWN_VIEW_MODE_KEY, "garbage");
    assert.equal(loadMarkdownViewMode(), "edit");
  });

  it("读取已保存的预览模式", () => {
    saveMarkdownViewMode("preview");
    assert.equal(loadMarkdownViewMode(), "preview");
  });
});

describe("saveMarkdownViewMode", () => {
  it("写回后再次读取一致", () => {
    saveMarkdownViewMode("edit");
    assert.equal(localStorage.getItem(MARKDOWN_VIEW_MODE_KEY), "edit");
    assert.equal(loadMarkdownViewMode(), "edit");
  });
});
