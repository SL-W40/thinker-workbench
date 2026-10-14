/**
 * 目录抽取：标题纯文本、引用与列表里的标题。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { extractToc } from "../src/extractToc";

describe("extractToc", () => {
  it("压平强调、行内代码与链接，并走进引用和列表", () => {
    const md = [
      "# Hello `code`",
      "",
      "> ## Quoted",
      "",
      "- ### [Link](https://example.com) item",
      "",
      "not a heading",
    ].join("\n");
    const toc = extractToc(md);
    assert.deepEqual(
      toc.map((item) => ({ level: item.level, text: item.text })),
      [
        { level: 1, text: "Hello code" },
        { level: 2, text: "Quoted" },
        { level: 3, text: "Link item" },
      ],
    );
    assert.ok(toc.every((item) => item.id.length > 0));
  });

  it("没有标题时为空", () => {
    assert.deepEqual(extractToc("just text"), []);
  });
});
