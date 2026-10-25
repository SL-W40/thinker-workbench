/**
 * MarkdownView 渲染：前置元数据块（frontmatter）是文档元数据，不参与正文渲染。
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { MarkdownView } from "../../src/react/MarkdownView";

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownView, { markdown }));
}

describe("MarkdownView frontmatter", () => {
  it("元数据块不渲染，只渲染正文", () => {
    const html = render("---\ntitle: 计划\nstatus: ready\n---\n# 正文\n\n内容。");
    assert.ok(html.includes("正文"));
    assert.ok(html.includes("内容"));
    assert.equal(html.includes("status: ready"), false);
    assert.equal(html.includes("title: 计划"), false);
  });

  it("无元数据块时正文原样渲染", () => {
    const html = render("# 标题\n\n内容。");
    assert.ok(html.includes("标题"));
    assert.ok(html.includes("内容"));
  });
});
