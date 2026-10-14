/**
 * Customize frontmatter 序列化与字段读取。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  metaBool,
  metaString,
  sanitizeKebabName,
  serializeFrontmatter,
} from "../../src/customize/frontmatter";

describe("customize frontmatter", () => {
  it("跳过空值，给需要引号的字符串加引号，正文补换行", () => {
    const text = serializeFrontmatter(
      { title: "a: b", flag: true, n: 2, skip: null, gone: undefined },
      "\nbody",
    );
    assert.match(text, /^---\ntitle: "a: b"\nflag: true\nn: 2\n---\nbody\n$/);
    assert.equal(serializeFrontmatter({ name: "" }, "x"), '---\nname: ""\n---\nx\n');
  });

  it("名称收成 kebab；meta 只认对应类型", () => {
    assert.equal(sanitizeKebabName("  Hello World! "), "hello-world");
    assert.equal(sanitizeKebabName("---", "item"), "item");
    assert.equal(metaString({ a: " x " }, "a"), "x");
    assert.equal(metaString({ a: 1 }, "a", "fb"), "fb");
    assert.equal(metaBool({ a: "true" }, "a"), true);
    assert.equal(metaBool({ a: "false" }, "a"), false);
    assert.equal(metaBool({ a: "yes" }, "a"), false);
    assert.equal(metaBool({}, "a", true), true);
  });
});
