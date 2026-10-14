/**
 * Markdown frontmatter：YAML / JSON / TOML 围栏与无效载荷。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter";

describe("parseFrontmatter", () => {
  it("没有围栏时正文原样返回", () => {
    const result = parseFrontmatter("hello");
    assert.equal(result.format, null);
    assert.equal(result.body, "hello");
    assert.deepEqual(result.data, {});
  });

  it("解析 yaml、json、toml，以及 +++ toml", () => {
    const yaml = parseFrontmatter("---\ntitle: Hi\n---\n\nbody");
    assert.equal(yaml.format, "yaml");
    assert.equal(yaml.data.title, "Hi");
    assert.equal(yaml.body, "body");

    const json = parseFrontmatter('---json\n{"ok":true,"n":1}\n---\n\nrest');
    assert.equal(json.format, "json");
    assert.equal(json.data.ok, true);
    assert.equal(json.data.n, 1);
    assert.equal(json.body, "rest");

    const toml = parseFrontmatter("---toml\nname = 'tw'\n[pkg]\nver = 2\n---\n\nx");
    assert.equal(toml.format, "toml");
    assert.equal(toml.data.name, "tw");
    assert.deepEqual(toml.data.pkg, { ver: 2 });

    const plus = parseFrontmatter("+++\nflag = true\n+++\n\ny");
    assert.equal(plus.format, "toml");
    assert.equal(plus.data.flag, true);
    assert.equal(plus.body, "y");
  });

  it("JSON 不是对象、或坏掉的载荷变成空对象，但围栏仍剥掉", () => {
    const array = parseFrontmatter("---json\n[1,2]\n---\n\nbody");
    assert.deepEqual(array.data, {});
    assert.equal(array.body, "body");

    const broken = parseFrontmatter("---json\n{,\n---\n\nbody");
    assert.deepEqual(broken.data, {});
    assert.equal(broken.format, "json");
  });
});
