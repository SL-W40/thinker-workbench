/**
 * UI 字体大小档位：写入 html dataset。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { applyUiFontScale } from "../../src/theme/fontScale";

describe("applyUiFontScale", () => {
  const prev = globalThis.document;

  afterEach(() => {
    if (prev === undefined) {
      // @ts-expect-error 测试清理伪造 document
      delete globalThis.document;
    } else {
      globalThis.document = prev;
    }
  });

  it("写入规范化后的 data-tw-font-scale", () => {
    const el = { dataset: {} as DOMStringMap };
    // @ts-expect-error 最小伪造 document
    globalThis.document = { documentElement: el };

    assert.equal(applyUiFontScale("large"), "large");
    assert.equal(el.dataset.twFontScale, "large");
  });

  it("非法值回落 medium", () => {
    const el = { dataset: {} as DOMStringMap };
    // @ts-expect-error 最小伪造 document
    globalThis.document = { documentElement: el };

    assert.equal(applyUiFontScale("xl"), "medium");
    assert.equal(el.dataset.twFontScale, "medium");
  });
});
