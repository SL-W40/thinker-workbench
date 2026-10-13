/**
 * shell exec_mode / write 规范化。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  normalizeShellWriteData,
  resolveShellExecMode,
} from "../../../src/tools/shell/execute";

describe("resolveShellExecMode", () => {
  it("auto：await=false → login；await=true → direct", () => {
    assert.equal(resolveShellExecMode("auto", false), "login");
    assert.equal(resolveShellExecMode(undefined, true), "direct");
  });

  it("显式覆盖 auto", () => {
    assert.equal(resolveShellExecMode("login", true), "login");
    assert.equal(resolveShellExecMode("direct", false), "direct");
  });
});

describe("normalizeShellWriteData", () => {
  it("ctrl+c / ^C 变成 \\x03 且不 submit", () => {
    assert.deepEqual(normalizeShellWriteData("ctrl+c", true), {
      payload: "\x03",
      submit: false,
    });
    assert.deepEqual(normalizeShellWriteData("^C", true), {
      payload: "\x03",
      submit: false,
    });
  });

  it("普通文本保留 submit", () => {
    assert.deepEqual(normalizeShellWriteData("y", true), {
      payload: "y",
      submit: true,
    });
  });
});
