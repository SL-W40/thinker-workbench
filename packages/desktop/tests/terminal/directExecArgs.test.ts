/**
 * direct argv 与 exec_mode auto 解析。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildDirectExecArgs, resolveExecMode } from "../../src/terminal/directExecArgs";

describe("resolveExecMode", () => {
  it("显式 login / direct 原样", () => {
    assert.equal(resolveExecMode("login", true), "login");
    assert.equal(resolveExecMode("direct", false), "direct");
  });

  it("auto：await=false → login；否则 direct", () => {
    assert.equal(resolveExecMode("auto", false), "login");
    assert.equal(resolveExecMode("auto", true), "direct");
    assert.equal(resolveExecMode(undefined, true), "direct");
    assert.equal(resolveExecMode(undefined, false), "login");
  });
});

describe("buildDirectExecArgs", () => {
  it("powershell / pwsh 用 -Command", () => {
    const inv = buildDirectExecArgs(
      { id: "pwsh", name: "pwsh", path: "pwsh.exe", args: [] },
      "Get-Date",
    );
    assert.equal(inv.file, "pwsh.exe");
    assert.deepEqual(inv.args.slice(-2), ["-Command", "Get-Date"]);
    assert.ok(inv.args.includes("-NoProfile"));
  });

  it("cmd 用 /c", () => {
    const inv = buildDirectExecArgs({ id: "cmd", name: "cmd", path: "cmd.exe", args: [] }, "dir");
    assert.deepEqual(inv.args, ["/d", "/s", "/c", "dir"]);
  });

  it("bash 用 -lc", () => {
    const inv = buildDirectExecArgs(
      { id: "bash", name: "bash", path: "/bin/bash", args: ["-l"] },
      "ls",
    );
    assert.deepEqual(inv.args, ["-lc", "ls"]);
  });

  it("fish 用 -c（不用 -lc）", () => {
    const inv = buildDirectExecArgs(
      { id: "fish", name: "fish", path: "/opt/homebrew/bin/fish", args: ["-l"] },
      "ls",
    );
    assert.deepEqual(inv.args, ["-c", "ls"]);
  });

  it("id=shell 且 path 为 fish 时仍走 -c", () => {
    const inv = buildDirectExecArgs(
      { id: "shell", name: "fish", path: "/opt/homebrew/bin/fish", args: ["-l"] },
      "echo hi",
    );
    assert.deepEqual(inv.args, ["-c", "echo hi"]);
  });
});
