/**
 * escapeHtml：HTML 元字符转义（renderer / desktop 共用单一实现）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { escapeHtml } from "../src/escapeHtml";

describe("escapeHtml", () => {
  it("转义 & < > 与双引号", () => {
    assert.equal(escapeHtml("&"), "&amp;");
    assert.equal(escapeHtml("<"), "&lt;");
    assert.equal(escapeHtml(">"), "&gt;");
    assert.equal(escapeHtml('"'), "&quot;");
    assert.equal(escapeHtml(`<a href="x">&`), "&lt;a href=&quot;x&quot;&gt;&amp;");
  });

  it("先转义 & 避免二次编码；其余字符原样保留", () => {
    // & 必须最先替换，否则后面生成的实体里的 & 会被再次转义
    assert.equal(escapeHtml("<"), "&lt;");
    assert.equal(escapeHtml("plain text 123 '"), "plain text 123 '");
  });

  it("空串与无元字符串原样返回", () => {
    assert.equal(escapeHtml(""), "");
    assert.equal(escapeHtml("hello world"), "hello world");
  });
});
