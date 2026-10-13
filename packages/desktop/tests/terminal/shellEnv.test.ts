/**
 * GUI PATH 补丁与 PTY env。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { augmentPathEnv, buildPtyEnv } from "../../src/terminal/shellEnv";

describe("augmentPathEnv", () => {
  it("Windows 原样返回", () => {
    if (process.platform !== "win32") return;
    assert.equal(augmentPathEnv("C:\\Windows"), "C:\\Windows");
  });

  it("非 Windows：不重复已有段", () => {
    if (process.platform === "win32") return;
    const input = "/usr/bin:/opt/homebrew/bin";
    const out = augmentPathEnv(input);
    assert.ok(out.includes("/opt/homebrew/bin"));
    assert.equal(out.split(":").filter((p) => p === "/opt/homebrew/bin").length, 1);
  });
});

describe("buildPtyEnv", () => {
  it("合并额外变量并保证 PATH 键存在", () => {
    const env = buildPtyEnv({ THINKER_AGENT: "1", TERM: "xterm-256color" });
    assert.equal(env.THINKER_AGENT, "1");
    assert.equal(env.TERM, "xterm-256color");
    const pathVal = env.PATH ?? env.Path;
    assert.ok(typeof pathVal === "string" && pathVal.length > 0);
  });
});
