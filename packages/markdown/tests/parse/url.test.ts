/**
 * 链接与图片地址白名单。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { sanitizeImageSrc, sanitizeUrl } from "../../src/parse/url";

describe("sanitizeUrl", () => {
  it("allows http(s), mailto, relative and hash urls", () => {
    assert.equal(sanitizeUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(sanitizeUrl("mailto:a@b.c"), "mailto:a@b.c");
    assert.equal(sanitizeUrl("./doc.md"), "./doc.md");
    assert.equal(sanitizeUrl("#fn-1"), "#fn-1");
    assert.equal(sanitizeUrl("//example.com"), "//example.com");
  });

  it("rejects script, data and file urls", () => {
    assert.equal(sanitizeUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeUrl("JavaScript:alert(1)"), null);
    assert.equal(sanitizeUrl("data:text/html,hi"), null);
    assert.equal(sanitizeUrl("file:///tmp/a"), null);
    assert.equal(sanitizeUrl("java\nscript:alert(1)"), null);
  });
});

describe("sanitizeImageSrc", () => {
  it("allows bitmap data urls and rejects svg or html data urls", () => {
    assert.equal(sanitizeImageSrc("data:image/png;base64,aaaa"), "data:image/png;base64,aaaa");
    assert.equal(sanitizeImageSrc("data:image/svg+xml;base64,aaaa"), null);
    assert.equal(sanitizeImageSrc("javascript:alert(1)"), null);
  });
});
