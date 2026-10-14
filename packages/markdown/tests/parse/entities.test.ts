/**
 * HTML 字符引用解码。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { decodeEntities } from "../../src/parse/entities";

describe("decodeEntities", () => {
  it("decodes named and numeric references", () => {
    assert.equal(decodeEntities("a &amp; b"), "a & b");
    assert.equal(decodeEntities("&#39;"), "'");
    assert.equal(decodeEntities("&#x27;"), "'");
    assert.equal(decodeEntities("&nbsp;"), "\u00A0");
    assert.equal(decodeEntities("&mdash;"), "\u2014");
  });

  it("leaves unknown references and code-like text alone", () => {
    assert.equal(decodeEntities("&notanentity;"), "&notanentity;");
    assert.equal(decodeEntities("plain"), "plain");
    assert.equal(decodeEntities("&amp"), "&amp");
  });
});
