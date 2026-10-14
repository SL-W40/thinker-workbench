/**
 * Ask / 只读子代理：允许探索类 browser；禁止交互类。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { isToolAllowedForChatMode, setChatMode } from "../../src/chatMode";

afterEach(() => {
  setChatMode("agent");
});

describe("browser explore vs mutate", () => {
  it("childReadonly：允许 navigate/snapshot，禁止 click/type/evaluate", () => {
    setChatMode("agent");
    const ro = { childReadonly: true };
    assert.equal(isToolAllowedForChatMode("browser_navigate", ro), true);
    assert.equal(isToolAllowedForChatMode("browser_snapshot", ro), true);
    assert.equal(isToolAllowedForChatMode("browser_screenshot", ro), true);
    assert.equal(isToolAllowedForChatMode("browser_scroll", ro), true);
    assert.equal(isToolAllowedForChatMode("browser_click", ro), false);
    assert.equal(isToolAllowedForChatMode("browser_type", ro), false);
    assert.equal(isToolAllowedForChatMode("browser_fill", ro), false);
    assert.equal(isToolAllowedForChatMode("browser_evaluate", ro), false);
  });

  it("Ask：同样允许探索、禁止交互", () => {
    setChatMode("ask");
    assert.equal(isToolAllowedForChatMode("browser_navigate"), true);
    assert.equal(isToolAllowedForChatMode("browser_lock"), true);
    assert.equal(isToolAllowedForChatMode("browser_click"), false);
  });

  it("Plan：探索与交互均禁止", () => {
    setChatMode("plan");
    assert.equal(isToolAllowedForChatMode("browser_navigate"), false);
    assert.equal(isToolAllowedForChatMode("browser_click"), false);
  });
});
