/**
 * 命令首 token：去引号、路径与 Windows 扩展名，供白名单比对。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { commandBaseToken } from "../../../src/tools/shell/approve";

describe("commandBaseToken", () => {
  it("空命令为空；取第一段并剥扩展名", () => {
    assert.equal(commandBaseToken("   "), "");
    assert.equal(commandBaseToken("git status"), "git");
    assert.equal(commandBaseToken('"C:\\\\Tools\\\\PNPM.EXE" install'), "pnpm");
    assert.equal(commandBaseToken("/usr/bin/node -v"), "node");
    assert.equal(commandBaseToken('"C:\\\\Windows\\\\System32\\\\format.com" C:'), "format");
  });
});
