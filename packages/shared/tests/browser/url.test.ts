import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { BROWSER_ABOUT_BLANK, browserUrlsEqual, normalizeBrowserUrl } from "../../src/browser/url";

describe("normalizeBrowserUrl", () => {
  it("空串变为 about:blank", () => {
    assert.equal(normalizeBrowserUrl(""), BROWSER_ABOUT_BLANK);
    assert.equal(normalizeBrowserUrl("   "), BROWSER_ABOUT_BLANK);
  });

  it("无协议时补 https", () => {
    assert.equal(normalizeBrowserUrl("example.com/a"), "https://example.com/a");
  });

  it("保留已有协议", () => {
    assert.equal(normalizeBrowserUrl("http://localhost:3000"), "http://localhost:3000");
  });
});

describe("browserUrlsEqual", () => {
  it("忽略尾斜杠与默认端口", () => {
    assert.equal(browserUrlsEqual("https://example.com", "https://example.com/"), true);
    assert.equal(browserUrlsEqual("https://example.com:443/a", "https://example.com/a"), true);
  });

  it("query 不同则不等", () => {
    assert.equal(browserUrlsEqual("https://example.com?a=1", "https://example.com?a=2"), false);
  });

  it("忽略 hash", () => {
    assert.equal(browserUrlsEqual("https://example.com/a#x", "https://example.com/a#y"), true);
  });
});
