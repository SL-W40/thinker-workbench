/**
 * hello / run 下发的 shell 开关、白名单与 profile。
 */
import assert from "node:assert/strict";
import { DEFAULT_SHELL_ALLOWLIST, DEFAULT_SHELL_APPROVAL_MODE } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import { applyShellConfig } from "../../src/host/shellConfig";
import { buildRunContext } from "../../src/runtime/buildRunContext";
import {
  getAllowAiBrowser,
  getAllowAiShell,
  getShellAllowlist,
  getShellApprovalMode,
  getShellBlocklist,
  getShellProfile,
  setAllowAiBrowser,
  setAllowAiShell,
  setShellAllowlist,
  setShellApprovalMode,
  setShellBlocklist,
  setShellProfile,
} from "../../src/workspace";

describe("applyShellConfig", () => {
  afterEach(() => {
    setAllowAiShell(true);
    setAllowAiBrowser(true);
    setShellApprovalMode(DEFAULT_SHELL_APPROVAL_MODE);
    setShellAllowlist([...DEFAULT_SHELL_ALLOWLIST]);
    setShellBlocklist([]);
    setShellProfile(null);
  });

  it("只覆盖消息里真正带上的布尔与名单，并记下 shell profile", () => {
    setAllowAiShell(false);
    applyShellConfig({});
    assert.equal(getAllowAiShell(), false);

    applyShellConfig({
      allowAiShell: true,
      allowAiBrowser: false,
      shellApprovalMode: "allowlist",
      shellAllowlist: ["Git", " pnpm "],
      shell: { id: "pwsh", name: "PowerShell", path: "pwsh", args: ["-NoLogo"] },
    });
    assert.equal(getAllowAiShell(), true);
    assert.equal(getAllowAiBrowser(), false);
    assert.equal(getShellApprovalMode(), "allowlist");
    assert.deepEqual(getShellAllowlist(), ["git", "pnpm"]);
    assert.equal(getShellProfile()?.id, "pwsh");
  });

  it("硬拒绝名单规范化，并压过当前白名单里的同一 token", () => {
    setShellAllowlist(["git", "rm", "pnpm"]);
    applyShellConfig({ shellBlocklist: [" RM.EXE ", "format.com"] });
    assert.deepEqual(getShellBlocklist(), ["rm", "format"]);
    assert.deepEqual(getShellAllowlist(), ["git", "pnpm"]);

    applyShellConfig({});
    assert.deepEqual(getShellBlocklist(), ["rm", "format"]);
  });

  it("RunContext 快照携带黑名单，重叠项不留在本轮白名单", () => {
    const ctx = buildRunContext({
      runId: "run_block",
      threadId: "thread_block",
      workspaceRoot: "C:\\tmp\\ws",
      shellAllowlist: ["git", "RM.EXE"],
      shellBlocklist: ["rm"],
      emit: () => {},
    });
    assert.deepEqual(ctx.shellBlocklist, ["rm"]);
    assert.deepEqual(ctx.shellAllowlist, ["git"]);
  });
});
