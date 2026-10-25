/**
 * MarkdownView 底部附加区块（footer 插槽）：渲染位置与缺省行为。
 * node 环境下用 react-dom/server 静态渲染，避免依赖 jsdom。
 */
import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { MarkdownView } from "../../src/react/MarkdownView";

function render(footer?: ReactNode): string {
  return renderToStaticMarkup(createElement(MarkdownView, { markdown: "正文段落。", footer }));
}

describe("MarkdownView footer", () => {
  it("传入时渲染在正文之后的文章底部", () => {
    const html = render(createElement("span", null, "底部内容"));
    assert.ok(html.includes('class="tw-md-footer"'));
    assert.ok(html.includes("底部内容"));
    assert.ok(html.indexOf("底部内容") > html.indexOf("正文段落"));
  });

  it("未传入时不渲染底部区块", () => {
    assert.equal(render().includes("tw-md-footer"), false);
    assert.equal(render(undefined).includes("tw-md-footer"), false);
  });
});
