/**
 * Markdown 语法解析冒烟测试（node:test）。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMarkdownStreaming } from "../stream";
import { parseInline } from "./inline";
import { parseMarkdown, parseMarkdownDocument } from "./blocks";

describe("parseInline", () => {
  it("strips backslash escapes", () => {
    const nodes = parseInline("\\* 星号 \\# 井号");
    const text = nodes.map((n) => (n.type === "text" ? n.value : "")).join("");
    assert.equal(text, "* 星号 # 井号");
  });

  it("parses mark / sub / sup / underline html", () => {
    const mark = parseInline("==高亮==");
    assert.equal(mark[0]?.type, "mark");
    const sub = parseInline("H~2~O");
    assert.ok(sub.some((n) => n.type === "sub"));
    const sup = parseInline("X^2^");
    assert.ok(sup.some((n) => n.type === "sup"));
    const u = parseInline("<u>下划线</u>");
    assert.equal(u[0]?.type, "underline");
  });

  it("parses footnote refs and autolinks", () => {
    const fn = parseInline("注[^1]");
    assert.ok(fn.some((n) => n.type === "footnoteRef" && n.id === "1"));
    const auto = parseInline("见 https://example.com 好");
    assert.ok(auto.some((n) => n.type === "autolink"));
  });

  it("parses inline math", () => {
    const nodes = parseInline("面积 $a^2$ 好");
    assert.ok(nodes.some((n) => n.type === "math" && n.value === "a^2"));
  });

  it("does not emphasize intraword underscores", () => {
    const nodes = parseInline("foo_bar_baz");
    assert.ok(nodes.every((n) => n.type === "text"));
    assert.equal(
      nodes.map((n) => (n.type === "text" ? n.value : "")).join(""),
      "foo_bar_baz",
    );
  });

  it("parses *** as strong wrapping emphasis", () => {
    const nodes = parseInline("***x***");
    assert.equal(nodes[0]?.type, "strong");
    if (nodes[0]?.type !== "strong") return;
    assert.equal(nodes[0].children[0]?.type, "emphasis");
  });

  it("parses link destinations with nested parentheses", () => {
    const nodes = parseInline("[t](http://a.com/x(y))");
    const link = nodes.find((n) => n.type === "link");
    assert.ok(link);
    assert.equal(link?.type, "link");
    if (link?.type !== "link") return;
    assert.equal(link.href, "http://a.com/x(y)");
  });
});

describe("parseMarkdownDocument", () => {
  it("resolves reference links", () => {
    const doc = parseMarkdownDocument(`[文字][id]\n\n[id]: https://a.test "t"`);
    const p = doc.blocks.find((b) => b.type === "paragraph");
    assert.ok(p);
    assert.equal(p.type, "paragraph");
    if (p.type !== "paragraph") return;
    const link = p.children.find((c) => c.type === "link");
    assert.ok(link);
    assert.equal(link.type, "link");
    if (link.type !== "link") return;
    assert.equal(link.href, "https://a.test");
    assert.equal(link.title, "t");
  });

  it("extracts footnotes", () => {
    const doc = parseMarkdownDocument(`正文[^a]。\n\n[^a]: 脚注内容`);
    assert.equal(doc.footnotes.length, 1);
    assert.equal(doc.footnotes[0]!.id, "a");
    assert.ok(
      doc.blocks.every((b) => b.type !== "paragraph" || !JSON.stringify(b).includes("[^a]:")),
    );
  });

  it("parses definition lists", () => {
    const blocks = parseMarkdown(`术语\n: 定义一行`);
    assert.equal(blocks[0]?.type, "definitionList");
    if (blocks[0]?.type === "definitionList") {
      assert.equal(blocks[0].items.length, 1);
      assert.ok(blocks[0].items[0]!.definitions.length >= 1);
    }
  });

  it("parses display math and tilde fences", () => {
    const math = parseMarkdown("$$\nx=1\n$$");
    assert.equal(math[0]?.type, "math");
    const code = parseMarkdown("~~~\njs\n~~~");
    // lang empty, still code
    assert.equal(code[0]?.type, "code");
  });

  it("parses task list items", () => {
    const blocks = parseMarkdown("- [x] 已完成\n- [ ] 未完成");
    assert.equal(blocks[0]?.type, "list");
    if (blocks[0]?.type === "list") {
      assert.equal(blocks[0].items[0]?.task, true);
      assert.equal(blocks[0].items[0]?.checked, true);
      assert.equal(blocks[0].items[1]?.checked, false);
    }
  });

  it("does not hang on malformed ATX-like lines", () => {
    for (const sample of ["##foo", "#", "###", "#\t"]) {
      const blocks = parseMarkdown(sample);
      assert.ok(blocks.length >= 1, sample);
      assert.equal(blocks[0]?.type, "paragraph", sample);
    }
  });

  it("parses GFM tables without leading pipes", () => {
    const blocks = parseMarkdown("a | b\n--- | ---\nc | d");
    assert.equal(blocks[0]?.type, "table");
    if (blocks[0]?.type !== "table") return;
    assert.equal(blocks[0].headers.length, 2);
    assert.equal(blocks[0].rows.length, 1);
  });

  it("keeps escaped pipes inside table cells", () => {
    const blocks = parseMarkdown("| a\\|b | c |\n| --- | --- |\n| 1 | 2 |");
    assert.equal(blocks[0]?.type, "table");
    if (blocks[0]?.type !== "table") return;
    assert.equal(blocks[0].headers.length, 2);
    const headerText = blocks[0].headers[0]!
      .map((n) => (n.type === "text" ? n.value : ""))
      .join("");
    assert.equal(headerText, "a|b");
  });

  it("strips ordered-list continuations by marker width", () => {
    const blocks = parseMarkdown("10. first\n    continued");
    assert.equal(blocks[0]?.type, "list");
    if (blocks[0]?.type !== "list") return;
    const item = blocks[0].items[0]!;
    // 10. + 空格 → 内容列宽 4；续行四个空格应剥净
    const blob = JSON.stringify(item.children);
    assert.ok(blob.includes("continued"));
    assert.ok(!blob.includes(" continued"));
  });

  it("marks complete trailing tables as complete when not streaming", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const blocks = parseMarkdown(md);
    assert.equal(blocks[0]?.type, "table");
    if (blocks[0]?.type !== "table") return;
    assert.equal(blocks[0].incomplete, undefined);
  });

  it("streaming: complete table ending with newline is not incomplete", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    const result = parseMarkdownStreaming(md);
    const table = result.blocks.find((b) => b.type === "table");
    assert.ok(table);
    if (table?.type !== "table") return;
    assert.equal(table.incomplete, false);
  });

  it("streaming: truncated final table row is incomplete", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const result = parseMarkdownStreaming(md);
    const table = result.blocks.find((b) => b.type === "table");
    assert.ok(table);
    if (table?.type !== "table") return;
    assert.equal(table.incomplete, true);
  });
});
