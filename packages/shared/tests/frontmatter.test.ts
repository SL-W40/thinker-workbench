/**
 * YAML frontmatter：块标量、列表与嵌套。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseYamlFrontmatter, parseYamlObject } from "../src/frontmatter";

describe("parseYamlObject", () => {
  it("解析折叠块标量", () => {
    const data = parseYamlObject(
      ["description: >-", "  Create skills.", "  Use when asked.", "name: demo"].join("\n"),
    );
    assert.equal(data.description, "Create skills. Use when asked.");
    assert.equal(data.name, "demo");
  });

  it("解析块列表与流式列表", () => {
    const data = parseYamlObject(
      ["paths:", "  - src/**", "  - *.md", "globs: [a.ts, b.ts]"].join("\n"),
    );
    assert.deepEqual(data.paths, ["src/**", "*.md"]);
    assert.deepEqual(data.globs, ["a.ts", "b.ts"]);
  });

  it("解析嵌套映射", () => {
    const data = parseYamlObject(["meta:", "  flag: true", "  count: 2"].join("\n"));
    assert.deepEqual(data.meta, { flag: true, count: 2 });
  });
});

describe("parseYamlFrontmatter", () => {
  it("拆掉围栏并留下正文", () => {
    const parsed = parseYamlFrontmatter("---\nname: demo\n---\n\n# Title\n");
    assert.equal(parsed.data.name, "demo");
    assert.match(parsed.body, /# Title/);
  });

  it("没有围栏时原文当正文", () => {
    const parsed = parseYamlFrontmatter("# only\n");
    assert.deepEqual(parsed.data, {});
    assert.equal(parsed.body, "# only\n");
  });
});
