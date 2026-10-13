/**
 * shell 类型识别（含 id=shell 但 path 为 fish）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isCmdShell, isFishShell, isPowerShell } from "../../src/terminal/shellKind";

describe("shellKind", () => {
  it("按 id 识别 fish / pwsh / cmd", () => {
    assert.equal(isFishShell({ id: "fish", path: "/usr/bin/fish" }), true);
    assert.equal(isPowerShell({ id: "pwsh", path: "pwsh" }), true);
    assert.equal(isCmdShell({ id: "cmd", path: "cmd.exe" }), true);
  });

  it("id=shell 时按可执行文件名识别 fish", () => {
    assert.equal(isFishShell({ id: "shell", path: "/opt/homebrew/bin/fish" }), true);
    assert.equal(isFishShell({ id: "shell", path: "/bin/zsh" }), false);
  });
});
