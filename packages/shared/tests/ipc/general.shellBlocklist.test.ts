/**
 * shellBlocklist：缺省为空，规范化折叠首 token，patch 时黑名单压过白名单。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEFAULT_SHELL_ALLOWLIST, normalizeGeneral } from "../../src/ipc/general";

describe("normalizeGeneral shellBlocklist", () => {
  it("缺字段、非法类型与显式空数组都是空名单", () => {
    assert.deepEqual(normalizeGeneral({}).shellBlocklist, []);
    assert.deepEqual(normalizeGeneral({ shellBlocklist: "rm" }).shellBlocklist, []);
    assert.deepEqual(normalizeGeneral({ shellBlocklist: [] }).shellBlocklist, []);
    assert.ok(normalizeGeneral({}).shellAllowlist.includes("git"));
  });

  it("折叠路径与扩展名，patch 合并后从白名单剔除重叠项", () => {
    const current = normalizeGeneral({
      shellAllowlist: ["git", "rm", "pnpm"],
      shellBlocklist: [],
    });
    assert.deepEqual(current.shellAllowlist, ["git", "rm", "pnpm"]);

    const blocked = normalizeGeneral({
      ...current,
      shellBlocklist: [" RM.EXE ", "C:\\Windows\\System32\\format.com", "format", 1],
    });
    assert.deepEqual(blocked.shellBlocklist, ["rm", "format"]);
    assert.deepEqual(blocked.shellAllowlist, ["git", "pnpm"]);

    const allowAgain = normalizeGeneral({
      ...blocked,
      shellAllowlist: [...blocked.shellAllowlist, "rm.exe"],
    });
    assert.deepEqual(allowAgain.shellBlocklist, ["rm", "format"]);
    assert.ok(!allowAgain.shellAllowlist.includes("rm"));
    assert.ok(!allowAgain.shellAllowlist.includes("rm.exe"));
    assert.ok(allowAgain.shellAllowlist.includes("git"));
  });

  it("未带黑名单的旧设置仍使用出厂白名单", () => {
    const general = normalizeGeneral({ shellApprovalMode: "allowlist" });
    assert.deepEqual(general.shellAllowlist, [...DEFAULT_SHELL_ALLOWLIST]);
    assert.deepEqual(general.shellBlocklist, []);
  });
});
