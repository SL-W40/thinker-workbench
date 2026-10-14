/**
 * 终端转义剥离：CSI / OSC 与残留控制字符。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { stripAnsi } from "../src/stripAnsi";

describe("stripAnsi", () => {
  it("去掉 CSI / OSC", () => {
    assert.equal(stripAnsi("a\x1b[31mb\x1b[0mc"), "abc");
    assert.equal(stripAnsi("x\x1b]666;done;0\x07y"), "xy");
  });

  it("去掉残留控制字符并保留换行", () => {
    const junk = "term_abc\x1b[8m\x08j\x08v\x1b[0m";
    const out = stripAnsi(junk);
    assert.ok(!out.includes("\x1b"));
    assert.ok(!out.includes("\x08"));
    assert.equal(stripAnsi("a\tb\nc\rd"), "a\tb\nc\rd");
  });
});
