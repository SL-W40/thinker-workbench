/**
 * Composer mention 解析冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { COMPOSER_CHIP_MARK } from "@thinker-workbench/shared";
import {
  detectActiveMention,
  extractContextPaths,
  extractUrls,
  formatAtPath,
  formatSlashSkill,
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
  it("ignores hand-typed @path and only takes marked chips", () => {
    assert.deepEqual(extractContextPaths("see @src/ "), []);
    assert.deepEqual(extractContextPaths(`see ${formatAtPath("src/").trim()} `), ["src"]);
    assert.deepEqual(extractContextPaths(`see ${formatAtPath("my dir/").trim()} please`), [
      "my dir",
    ]);
  });
});

describe("parseMentionSegments", () => {
  it("display keeps hand-typed @path as plain text", () => {
    const segs = parseMentionSegments("look @src/ next", "display");
    assert.equal(segs.filter((s) => s.kind === "at").length, 0);
    assert.equal(segs.map((s) => s.text).join(""), "look @src/ next");
  });

  it("display chips panel-selected @path (with mark)", () => {
    const text = `look ${formatAtPath("src/").trim()} next`;
    assert.ok(text.includes(COMPOSER_CHIP_MARK));
    const segs = parseMentionSegments(text, "display");
    const at = segs.find((s) => s.kind === "at");
    assert.ok(at && at.kind === "at");
    assert.equal(at.path, "src/");
  });

  it("plain @path still requires a leading space", () => {
    const segs = parseMentionSegments(`文字${formatAtPath("src/x").trim()}`, "display");
    assert.equal(
      segs.find((s) => s.kind === "at"),
      undefined,
    );
  });

  it("display keeps hand-typed /skill as plain text", () => {
    const segs = parseMentionSegments("please /write-tests now", "display");
    assert.equal(segs.filter((s) => s.kind === "slash").length, 0);
    assert.equal(segs.map((s) => s.text).join(""), "please /write-tests now");
  });

  it("display chips panel-selected /skill (with mark)", () => {
    const text = `run ${formatSlashSkill("write-tests").trim()} ok`;
    assert.ok(text.includes(COMPOSER_CHIP_MARK));
    const segs = parseMentionSegments(text, "display");
    const slash = segs.find((s) => s.kind === "slash");
    assert.ok(slash && slash.kind === "slash");
    assert.equal(slash.name, "write-tests");
  });

  it("edit chips /skill only when pinned", () => {
    const bare = parseMentionSegments("/write-tests ", "edit");
    assert.equal(bare.filter((s) => s.kind === "slash").length, 0);
    const pinned = parseMentionSegments("/write-tests ", "edit", new Set(["/write-tests"]));
    assert.equal(pinned.filter((s) => s.kind === "slash").length, 1);
  });

  it("edit chips @path only when pinned", () => {
    const bare = parseMentionSegments("@src/a.ts ", "edit");
    assert.equal(bare.filter((s) => s.kind === "at").length, 0);
    const pinned = parseMentionSegments("@src/a.ts ", "edit", new Set(["@src/a.ts"]));
    assert.equal(pinned.filter((s) => s.kind === "at").length, 1);
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
