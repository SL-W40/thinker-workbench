/**
 * 流式解析：未闭合围栏、安全回退、开闭围栏检测。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { hasOpenFence, parseMarkdownSafe, parseMarkdownStreaming } from "../src/stream";

describe("parseMarkdownStreaming", () => {
  it("完整段落不是未完成", () => {
    const result = parseMarkdownStreaming("hello");
    assert.equal(result.incomplete, false);
    assert.equal(result.open, null);
    assert.equal(result.blocks[0]?.type, "paragraph");
  });

  it("未闭合代码围栏标成 open code", () => {
    const result = parseMarkdownStreaming("```ts\nconst a = 1");
    assert.equal(result.incomplete, true);
    assert.equal(result.open?.kind, "code");
    if (result.open?.kind === "code") {
      assert.equal(result.open.lang, "ts");
      assert.match(result.open.value, /const a/);
    }
  });

  it("null 当空串", () => {
    const result = parseMarkdownStreaming(null as unknown as string);
    assert.equal(result.incomplete, false);
  });
});

describe("parseMarkdownSafe / hasOpenFence", () => {
  it("正常文本能解析；开着的围栏能被认出来", () => {
    const blocks = parseMarkdownSafe("# Title");
    assert.equal(blocks[0]?.type, "heading");
    assert.equal(hasOpenFence("```js\ncode"), true);
    assert.equal(hasOpenFence("```js\ncode\n```"), false);
    assert.equal(hasOpenFence("```js inline ` tick"), false);
    assert.equal(hasOpenFence(null as unknown as string), false);
  });
});
