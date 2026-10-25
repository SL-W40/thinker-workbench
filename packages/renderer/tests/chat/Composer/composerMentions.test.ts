/**
 * Composer mention 解析冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  detectActiveMention,
  extractAttachmentIds,
  extractContextPaths,
  extractUrls,
  formatFileAttachment,
  isAttachmentPath,
  linkLabel,
  parseMentionSegments,
} from "../../../src/features/chat/composer/composerMentions";

describe("detectActiveMention", () => {
  it("triggers on bare @ after whitespace", () => {
    const m = detectActiveMention("say @", 5);
    assert.equal(m?.kind, "at");
    assert.equal(m?.query, "");
  });

  it("ends when query contains a space", () => {
    assert.equal(detectActiveMention("say @ ", 6), null);
    assert.equal(detectActiveMention("@foo bar", 8), null);
  });
});

describe("extractContextPaths", () => {
  it("strips trailing slash from directory mentions", () => {
    assert.deepEqual(extractContextPaths("see @src/ "), ["src"]);
    assert.deepEqual(extractContextPaths("see @`my dir/` please"), ["my dir"]);
  });

  it("excludes external @file:<id> references", () => {
    assert.deepEqual(extractContextPaths("@file:abc123 @src/index.ts"), ["src/index.ts"]);
    assert.deepEqual(extractContextPaths("read @report.pdf and @file:zzz"), ["report.pdf"]);
  });
});

describe("extractAttachmentIds", () => {
  it("collects @file:<id> tokens", () => {
    assert.deepEqual(extractAttachmentIds("see @file:abc123 done"), ["abc123"]);
    assert.deepEqual(extractAttachmentIds("@file:aaa @file:bbb @file:aaa"), ["aaa", "bbb"]);
  });

  it("stops the id at a whitespace boundary", () => {
    assert.deepEqual(extractAttachmentIds("@file:a b c"), ["a"]);
  });

  it("stops the id at an embedded @", () => {
    assert.deepEqual(extractAttachmentIds("@file:a@b"), ["a"]);
  });

  it("does not capture plain workspace paths", () => {
    assert.deepEqual(extractAttachmentIds("open @src/file.ts"), []);
  });
});

describe("isAttachmentPath / formatFileAttachment", () => {
  it("recognizes file: prefix", () => {
    assert.equal(isAttachmentPath("file:abc"), true);
    assert.equal(isAttachmentPath("src/file.ts"), false);
  });

  it("formats attachment token with trailing space", () => {
    assert.equal(formatFileAttachment("abc"), "@file:abc ");
  });
});

describe("parseMentionSegments", () => {
  it("keeps directory chips that end with /", () => {
    const segs = parseMentionSegments("look @src/ next", "display");
    const at = segs.find((s) => s.kind === "at");
    assert.ok(at && at.kind === "at");
    assert.equal(at.path, "src/");
  });

  it("@file: chipifies without a leading space", () => {
    const segs = parseMentionSegments("文字@file:abc", "display");
    assert.deepEqual(
      segs.filter((s) => s.kind === "text").map((s) => s.text),
      ["文字"],
    );
    const at = segs.find((s) => s.kind === "at");
    assert.ok(at && at.kind === "at");
    assert.equal(at.path, "file:abc");
    assert.equal(at.text, "@file:abc");
  });

  it("plain @path still requires a leading space", () => {
    const segs = parseMentionSegments("文字@src/x", "display");
    assert.equal(
      segs.find((s) => s.kind === "at"),
      undefined,
    );
  });
});

describe("extractAttachmentIds", () => {
  it("captures @file: ids without a leading space", () => {
    assert.deepEqual(extractAttachmentIds("文字@file:abc done"), ["abc"]);
    assert.deepEqual(extractAttachmentIds("前@file:xyz 后"), ["xyz"]);
  });
});

describe("detectActiveMention", () => {
  it("@ path with slash stays active (can type / in file mention)", () => {
    const text = "import @src/components/Button";
    const m = detectActiveMention(text, text.length);
    assert.ok(m && m.kind === "at");
    assert.equal(m?.query, "src/components/Button");
  });

  it("internal slash is treated as path separator, not end of mention", () => {
    const text = "see @foo/bar/baz";
    const m = detectActiveMention(text, text.length);
    assert.ok(m && m.kind === "at");
    assert.equal(m?.query, "foo/bar/baz");
  });

  it("@ at token start keeps mention even when query contains slashes", () => {
    const text = "x @a/b/c";
    const m = detectActiveMention(text, text.length);
    assert.ok(m && m.kind === "at");
    assert.equal(m?.query, "a/b/c");
  });
});

describe("extractUrls", () => {
  it("collects http/https urls and strips trailing punctuation", () => {
    assert.deepEqual(extractUrls("见 https://a.com/x?y=1。 还有 http://b.org"), [
      "https://a.com/x?y=1",
      "http://b.org",
    ]);
  });

  it("keeps balanced parentheses inside the url", () => {
    assert.deepEqual(extractUrls("https://en.wikipedia.org/wiki/A_(b)"), [
      "https://en.wikipedia.org/wiki/A_(b)",
    ]);
    // 未配对的右括号视为句末标点
    assert.deepEqual(extractUrls("(见 https://a.com/x)"), ["https://a.com/x"]);
  });

  it("returns empty when there is no url", () => {
    assert.deepEqual(extractUrls("plain text @src/a.ts /review"), []);
  });
});

describe("linkLabel", () => {
  it("drops protocol and www", () => {
    assert.equal(linkLabel("https://www.github.com/a/b"), "github.com/a/b");
    assert.equal(linkLabel("http://a.com/"), "a.com");
  });

  it("elides in the middle when too long", () => {
    const label = linkLabel("https://github.com/very/long/path/to/some/file.ts");
    assert.ok(label.length < 40);
    assert.ok(label.includes("…"));
    assert.ok(label.startsWith("github.com/"));
    assert.ok(label.endsWith("e/file.ts"));
  });
});

describe("parseMentionSegments 网址", () => {
  it("display mode chips the url", () => {
    const segs = parseMentionSegments("见 https://a.com/x 这里", "display");
    const links = segs.filter((s) => s.kind === "link");
    assert.equal(links.length, 1);
    assert.deepEqual(links[0], { kind: "link", text: "https://a.com/x", url: "https://a.com/x" });
  });

  it("edit mode keeps hand-typed url as text", () => {
    const segs = parseMentionSegments("https://a.com/x ", "edit");
    assert.equal(segs.filter((s) => s.kind === "link").length, 0);
    // 文本段合起来仍是原文
    assert.equal(segs.map((s) => s.text).join(""), "https://a.com/x ");
  });

  it("edit mode chips the url only when pinned (粘贴)", () => {
    const segs = parseMentionSegments("https://a.com/x ", "edit", new Set(["https://a.com/x"]));
    assert.equal(segs.filter((s) => s.kind === "link").length, 1);
  });

  it("leaves trailing punctuation as text", () => {
    const segs = parseMentionSegments("见 https://a.com/x。", "display");
    assert.equal(segs.map((s) => s.text).join(""), "见 https://a.com/x。");
    assert.equal(segs.filter((s) => s.kind === "link").length, 1);
  });
});
