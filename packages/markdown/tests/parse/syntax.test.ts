/**
 * Markdown 语法解析冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseMarkdown, parseMarkdownDocument } from "../../src/parse/blocks";
import { parseInline } from "../../src/parse/inline";
import { parseMarkdownStreaming } from "../../src/stream";

describe("parseInline", () => {
  it("strips backslash escapes", () => {
    const nodes = parseInline("\\* 星号 \\# 井号");
    const text = nodes.map((n) => (n.type === "text" ? n.value : "")).join("");
    assert.equal(text, "* 星号 # 井号");
  });

  it("parses mark / sub / sup / underline html", () => {
    const mark = parseInline("==高亮==");
    assert.equal(mark[0]?.type, "mark");
    const sub = parseInline("H<sub>2</sub>O");
    assert.ok(sub.some((n) => n.type === "sub"));
    const filename = parseInline("file~1~");
    assert.ok(filename.every((n) => n.type === "text"));
    assert.equal(filename.map((n) => (n.type === "text" ? n.value : "")).join(""), "file~1~");
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
    assert.equal(nodes.map((n) => (n.type === "text" ? n.value : "")).join(""), "foo_bar_baz");
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
    assert.equal(doc.footnotes[0]?.id, "a");
    assert.ok(
      doc.blocks.every((b) => b.type !== "paragraph" || !JSON.stringify(b).includes("[^a]:")),
    );
  });

  it("parses definition lists", () => {
    const blocks = parseMarkdown(`术语\n: 定义一行`);
    assert.equal(blocks[0]?.type, "definitionList");
    if (blocks[0]?.type === "definitionList") {
      assert.equal(blocks[0].items.length, 1);
      assert.ok(blocks[0].items[0]?.definitions.length >= 1);
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

  it("keeps body between horizontal rules", () => {
    const blocks = parseMarkdown("---\n\n这里是正文\n\n---\n");
    const blob = JSON.stringify(blocks);
    assert.ok(blob.includes("这里是正文"));
    assert.ok(blocks.some((b) => b.type === "hr"));
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
    const headerText = blocks[0].headers[0]
      ?.map((n) => (n.type === "text" ? n.value : ""))
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

  it("keeps link defs and footnotes inside fenced code", () => {
    const doc = parseMarkdownDocument("```\n[id]: https://example.com\nkeep\n```\n\n[^1]: nope\n");
    const code = doc.blocks.find((b) => b.type === "code");
    assert.ok(code);
    assert.equal(code.type, "code");
    if (code.type !== "code") return;
    assert.match(code.value, /\[id\]: https:\/\/example.com/);
    assert.match(code.value, /keep/);
    assert.equal(doc.linkDefs.id, undefined);
    const fencedNote = parseMarkdownDocument("```\n[^1]: nope\n```\n\nx");
    assert.equal(fencedNote.footnotes.length, 0);
    const noteCode = fencedNote.blocks.find((b) => b.type === "code");
    assert.equal(noteCode?.type, "code");
    if (noteCode?.type === "code") assert.match(noteCode.value, /nope/);
  });

  it("parses spaced thematic breaks", () => {
    for (const sample of ["* * *", "- - -", "_ _ _", "  ***"]) {
      const blocks = parseMarkdown(sample);
      assert.equal(blocks[0]?.type, "hr", sample);
    }
  });

  it("parses setext headings and keeps a lone rule", () => {
    const headings = parseMarkdown("Hello\n=====\n\nWorld\n-----");
    assert.equal(headings[0]?.type, "heading");
    assert.equal(headings[1]?.type, "heading");
    if (headings[0]?.type === "heading" && headings[1]?.type === "heading") {
      assert.equal(headings[0].level, 1);
      assert.equal(headings[1].level, 2);
    }
    const rule = parseMarkdown("---\n\n正文\n\n---");
    assert.ok(rule.some((b) => b.type === "hr"));
    assert.ok(JSON.stringify(rule).includes("正文"));
  });

  it("allows up to three spaces before fences and quotes", () => {
    const code = parseMarkdown("   ```js\n   const x = 1\n   ```");
    assert.equal(code[0]?.type, "code");
    if (code[0]?.type === "code") {
      assert.equal(code[0].lang, "js");
      assert.equal(code[0].value, "const x = 1");
    }
    const quote = parseMarkdown("   > quoted");
    assert.equal(quote[0]?.type, "blockquote");
  });

  it("parses indented code blocks", () => {
    const blocks = parseMarkdown("    code line\n    more");
    assert.equal(blocks[0]?.type, "code");
    if (blocks[0]?.type === "code") assert.equal(blocks[0].value, "code line\nmore");
  });

  it("continues lazy blockquotes until a blank line", () => {
    const blocks = parseMarkdown("> line1\nline2");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.type, "blockquote");
    assert.ok(JSON.stringify(blocks[0]).includes("line2"));
    const split = parseMarkdown("> a\n\nb");
    assert.equal(split[0]?.type, "blockquote");
    assert.equal(split[1]?.type, "paragraph");
  });

  it("resolves shortcut references and titles on the next line", () => {
    const doc = parseMarkdownDocument('See [id].\n\n[id]: https://x.test\n  "title"');
    const para = doc.blocks.find((b) => b.type === "paragraph");
    assert.equal(para?.type, "paragraph");
    if (para?.type !== "paragraph") return;
    const link = para.children.find((n) => n.type === "link");
    assert.equal(link?.type, "link");
    if (link?.type !== "link") return;
    assert.equal(link.href, "https://x.test");
    assert.equal(link.title, "title");
    assert.equal(doc.blocks.length, 1);
  });

  it("accepts angle destinations that contain spaces", () => {
    const nodes = parseInline("[a](<https://x.test/a b>)");
    const link = nodes.find((n) => n.type === "link");
    assert.equal(link?.type, "link");
    if (link?.type !== "link") return;
    assert.equal(link.href, "https://x.test/a b");
  });

  it("decodes html entities outside code spans", () => {
    const nodes = parseInline("a &amp; b &#39; c &nbsp; d");
    const text = nodes.map((n) => (n.type === "text" ? n.value : "")).join("");
    assert.equal(text, "a & b ' c \u00A0 d");
    const code = parseInline("`<u>`");
    assert.equal(code[0]?.type, "code");
    if (code[0]?.type === "code") assert.equal(code[0].value, "<u>");
  });

  it("strips atx closing hashes and dedupes heading ids", () => {
    const blocks = parseMarkdown("## Hello ##\n\n# Same\n\n# Same");
    assert.equal(blocks[0]?.type, "heading");
    if (blocks[0]?.type === "heading") {
      assert.equal(
        blocks[0].children.map((n) => (n.type === "text" ? n.value : "")).join(""),
        "Hello",
      );
    }
    const ids = blocks
      .filter((b) => b.type === "heading")
      .map((b) => (b.type === "heading" ? b.id : ""));
    assert.deepEqual(ids, ["hello", "same", "same-1"]);
  });

  it("parses a single-column table", () => {
    const blocks = parseMarkdown("| a |\n| --- |\n| 1 |");
    assert.equal(blocks[0]?.type, "table");
    if (blocks[0]?.type !== "table") return;
    assert.equal(blocks[0].headers.length, 1);
    assert.equal(blocks[0].rows.length, 1);
  });

  it("parses paren ordered lists and empty task items", () => {
    const ordered = parseMarkdown("1) one\n2) two");
    assert.equal(ordered[0]?.type, "list");
    if (ordered[0]?.type === "list") {
      assert.equal(ordered[0].ordered, true);
      assert.equal(ordered[0].items.length, 2);
    }
    const tasks = parseMarkdown("- [ ]\n- [x]");
    assert.equal(tasks[0]?.type, "list");
    if (tasks[0]?.type === "list") {
      assert.equal(tasks[0].items[0]?.task, true);
      assert.equal(tasks[0].items[0]?.checked, false);
      assert.equal(tasks[0].items[1]?.checked, true);
    }
    const stuck = parseMarkdown("- [x]done");
    if (stuck[0]?.type === "list") assert.equal(stuck[0].items[0]?.task, false);
  });

  it("does not treat a colon-ending line as a definition term", () => {
    const blocks = parseMarkdown("Note:\n: not a term");
    assert.ok(blocks.every((b) => b.type !== "definitionList"));
    assert.ok(JSON.stringify(blocks).includes("Note:"));
    assert.ok(JSON.stringify(blocks).includes("not a term"));
  });

  it("leaves ideographic punctuation outside autolinks", () => {
    const nodes = parseInline("见https://example.com。");
    const auto = nodes.find((n) => n.type === "autolink");
    assert.equal(auto?.type, "autolink");
    if (auto?.type !== "autolink") return;
    assert.equal(auto.href, "https://example.com");
  });

  it("drops unsafe link schemes", () => {
    const nodes = parseInline("[x](javascript:alert(1))");
    assert.ok(nodes.every((n) => n.type !== "link"));
    assert.ok(nodes.some((n) => n.type === "text" && n.value === "x"));
    const file = parseInline("[x](file:///tmp/a)");
    assert.ok(file.every((n) => n.type !== "link"));
  });

  it("does not autolink an unfinished streaming destination", () => {
    const result = parseMarkdownStreaming("see [text](https://exa");
    const blob = JSON.stringify(result.blocks);
    assert.equal(blob.includes('"autolink"'), false);
    assert.ok(blob.includes("https://exa"));
  });

  it("marks github alerts", () => {
    const blocks = parseMarkdown("> [!WARNING]\n> careful");
    assert.equal(blocks[0]?.type, "blockquote");
    if (blocks[0]?.type !== "blockquote") return;
    assert.equal(blocks[0].alert, "warning");
    const blob = JSON.stringify(blocks[0].children);
    assert.ok(blob.includes("careful"));
    assert.equal(blob.includes("[!WARNING]"), false);
  });
});
