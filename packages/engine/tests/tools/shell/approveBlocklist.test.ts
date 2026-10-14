/**
 * 硬拒绝先于 unrestricted / 白名单 / AI 研判 / HITL。
 * 确认到达时若 token 已在黑名单，不能执行，也不能写入白名单。
 */
import assert from "node:assert/strict";
import type { UtilityToParent } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import { resolveHitl } from "../../../src/hitl/requestHitl";
import { buildRunContext } from "../../../src/runtime/buildRunContext";
import { runWithContext } from "../../../src/runtime/runContext";
import { ensureShellApproved } from "../../../src/tools/shell/approve";
import {
  addShellAllowlistToken,
  setShellAllowlist,
  setShellApprovalMode,
  setShellBlocklist,
} from "../../../src/workspace";

type ParentPort = {
  postMessage: (message: unknown) => void;
  on: (event: "message", listener: (event: { data: unknown }) => void) => void;
};

const processWithPort = process as NodeJS.Process & { parentPort?: ParentPort };

function installParentPort(messages: unknown[]): () => void {
  const prev = processWithPort.parentPort;
  processWithPort.parentPort = {
    postMessage(message) {
      messages.push(message);
    },
    on() {},
  };
  return () => {
    processWithPort.parentPort = prev;
  };
}

async function settleApproval(command: string): Promise<Error | "allowed" | "pending"> {
  return Promise.race([
    ensureShellApproved(command, new AbortController().signal).then(
      () => "allowed" as const,
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 40)),
  ]);
}

describe("ensureShellApproved blocklist", () => {
  afterEach(() => {
    setShellApprovalMode("ai_review");
    setShellAllowlist(["git"]);
    setShellBlocklist([]);
    delete processWithPort.parentPort;
  });

  it("三种审批模式都拒绝黑名单首 token，且不进入 HITL", async () => {
    setShellAllowlist(["rm", "format", "git"]);
    setShellBlocklist(["rm", "format"]);
    for (const mode of ["unrestricted", "allowlist", "ai_review"] as const) {
      setShellApprovalMode(mode);
      const rm = await settleApproval("RM.EXE -rf /tmp/x");
      const format = await settleApproval('"C:\\\\Windows\\\\System32\\\\format.com" C:');
      assert.ok(rm instanceof Error, `${mode} rm`);
      assert.match(rm.message, /hard-deny list/);
      assert.match(rm.message, /"rm"/);
      assert.ok(format instanceof Error, `${mode} format`);
      assert.match(format.message, /"format"/);
    }
  });

  it("未命中的命令仍按原模式放行", async () => {
    setShellBlocklist(["rm"]);
    setShellApprovalMode("unrestricted");
    assert.equal(await settleApproval("git status"), "allowed");

    setShellApprovalMode("allowlist");
    setShellAllowlist(["git"]);
    assert.equal(await settleApproval("git status"), "allowed");
  });

  it("本轮上下文里的黑名单优先于进程默认，并行 run 互不影响", async () => {
    setShellBlocklist([]);
    setShellApprovalMode("unrestricted");
    const blocked = buildRunContext({
      runId: "run_blocked",
      threadId: "thread_blocked",
      workspaceRoot: "C:\\tmp\\a",
      shellApprovalMode: "unrestricted",
      shellAllowlist: ["rm"],
      shellBlocklist: ["rm"],
      emit: () => {},
    });
    const open = buildRunContext({
      runId: "run_open",
      threadId: "thread_open",
      workspaceRoot: "C:\\tmp\\b",
      shellApprovalMode: "unrestricted",
      shellAllowlist: ["rm"],
      shellBlocklist: [],
      emit: () => {},
    });
    const denied = await runWithContext(blocked, () => settleApproval("rm -rf /tmp/x"));
    const allowed = await runWithContext(open, () => settleApproval("rm -rf /tmp/x"));
    assert.ok(denied instanceof Error);
    assert.match(denied.message, /hard-deny list/);
    assert.equal(allowed, "allowed");
  });

  it("HITL 允许并加入白名单时，已进入黑名单的 token 被拒绝且不写入白名单", async () => {
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      const ctx = buildRunContext({
        runId: "run_hitl",
        threadId: "thread_hitl",
        workspaceRoot: "C:\\tmp\\hitl",
        shellApprovalMode: "allowlist",
        shellAllowlist: [],
        shellBlocklist: [],
        emit: () => {},
      });
      const pending = runWithContext(ctx, () =>
        ensureShellApproved("rm -rf /tmp/x", new AbortController().signal),
      );
      const posted = messages[0] as Extract<UtilityToParent, { kind: "hitl" }>;
      assert.equal(posted?.kind, "hitl");
      ctx.shellBlocklist = ["rm"];
      resolveHitl({ hitlId: posted.request.hitlId, actionId: "allow_and_whitelist" });
      await assert.rejects(pending, /hard-deny list/);
      await runWithContext(ctx, async () => {
        addShellAllowlistToken("rm");
      });
      assert.deepEqual(ctx.shellAllowlist, []);
    } finally {
      restore();
    }
  });

  it("HITL 仅允许也不能覆盖硬拒绝", async () => {
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      const ctx = buildRunContext({
        runId: "run_allow",
        threadId: "thread_allow",
        workspaceRoot: "C:\\tmp\\allow",
        shellApprovalMode: "allowlist",
        shellAllowlist: [],
        shellBlocklist: [],
        emit: () => {},
      });
      const pending = runWithContext(ctx, () =>
        ensureShellApproved("format C:", new AbortController().signal),
      );
      const posted = messages[0] as Extract<UtilityToParent, { kind: "hitl" }>;
      ctx.shellBlocklist = ["format"];
      resolveHitl({ hitlId: posted.request.hitlId, actionId: "allow" });
      await assert.rejects(pending, /"format"/);
    } finally {
      restore();
    }
  });
});
