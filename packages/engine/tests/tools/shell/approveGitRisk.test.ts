/**
 * git 闸门：不可逆写操作强制确认，优先于白名单；unrestricted 尊重用户全放开设置。
 */
import assert from "node:assert/strict";
import type { UtilityToParent } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import { resolveHitl } from "../../../src/hitl/requestHitl";
import { ensureShellApproved } from "../../../src/tools/shell/approve";
import {
  getShellAllowlist,
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

/** 取发出的 HITL 请求（闸门弹卡）。 */
function hitlRequest(messages: unknown[]) {
  return messages[0] as Extract<UtilityToParent, { kind: "hitl" }> | undefined;
}

/** 40ms 内没有弹卡就认为已放行（与 approveBlocklist.test.ts 同款夹具）。 */
async function settleApproval(command: string): Promise<Error | "allowed" | "pending"> {
  return Promise.race([
    ensureShellApproved(command, new AbortController().signal).then(
      () => "allowed" as const,
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 40)),
  ]);
}

describe("ensureShellApproved git 闸门", () => {
  afterEach(() => {
    setShellApprovalMode("ai_review");
    setShellAllowlist(["git"]);
    setShellBlocklist([]);
    delete processWithPort.parentPort;
  });

  it("只读 git 命令不弹卡、不调模型", async () => {
    setShellApprovalMode("ai_review");
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      assert.equal(await settleApproval("git status"), "allowed");
      assert.equal(await settleApproval("git -C packages diff --stat"), "allowed");
      assert.equal(messages.length, 0, "只读命令不应弹卡");
    } finally {
      restore();
    }
  });

  it("commit 弹确认卡，Allow 放行 / Deny 拒绝", async () => {
    setShellApprovalMode("ai_review");
    const allowMessages: unknown[] = [];
    const restoreAllow = installParentPort(allowMessages);
    try {
      const pending = ensureShellApproved("git commit -m x", new AbortController().signal);
      const posted = hitlRequest(allowMessages);
      assert.equal(posted?.kind, "hitl");
      assert.equal(posted?.request.kind, "shell_approval");
      assert.deepEqual(
        posted?.request.actions.map((action) => action.id),
        ["allow", "deny"],
        "不提供「允许并加白」",
      );
      assert.match(posted?.request.body ?? "", /git commit/);
      resolveHitl({ hitlId: posted?.request.hitlId ?? "", actionId: "allow" });
      await pending;
      assert.deepEqual(getShellAllowlist(), ["git"], "Allow 只授权本次命令，不改写白名单");
    } finally {
      restoreAllow();
    }

    const denyMessages: unknown[] = [];
    const restoreDeny = installParentPort(denyMessages);
    try {
      const pending = ensureShellApproved("git commit -m x", new AbortController().signal);
      const posted = hitlRequest(denyMessages);
      resolveHitl({ hitlId: posted?.request.hitlId ?? "", actionId: "deny" });
      await assert.rejects(pending, /denied by user/);
    } finally {
      restoreDeny();
    }
  });

  it("闸门先于白名单：allowlist 模式下 git 已加白也要确认", async () => {
    setShellApprovalMode("allowlist");
    setShellAllowlist(["git"]);
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      const pending = ensureShellApproved("git push", new AbortController().signal);
      const posted = hitlRequest(messages);
      assert.equal(posted?.request.kind, "shell_approval");
      assert.match(posted?.request.title ?? "", /remote/);
      resolveHitl({ hitlId: posted?.request.hitlId ?? "", actionId: "allow" });
      await pending;
    } finally {
      restore();
    }
  });

  it("unrestricted 尊重全放开设置，不弹卡", async () => {
    setShellApprovalMode("unrestricted");
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      assert.equal(await settleApproval("git commit -m x"), "allowed");
      assert.equal(await settleApproval("git reset --hard"), "allowed");
      assert.equal(messages.length, 0);
    } finally {
      restore();
    }
  });

  it("硬拒绝优先于 git 闸门，不弹卡", async () => {
    setShellApprovalMode("ai_review");
    setShellBlocklist(["git"]);
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      const err = await settleApproval("git commit -m x");
      assert.ok(err instanceof Error);
      assert.match(err.message, /hard-deny list/);
      assert.equal(messages.length, 0);
    } finally {
      restore();
    }
  });

  it("命令链只拦命中段，只读段不受影响", async () => {
    setShellApprovalMode("ai_review");
    const messages: unknown[] = [];
    const restore = installParentPort(messages);
    try {
      assert.equal(await settleApproval("git status && git log"), "allowed");
      assert.equal(messages.length, 0);

      const pending = ensureShellApproved(
        "git status && git commit -m x",
        new AbortController().signal,
      );
      const posted = hitlRequest(messages);
      assert.match(posted?.request.body ?? "", /git commit/);
      assert.doesNotMatch(posted?.request.body ?? "", /git status/);
      resolveHitl({ hitlId: posted?.request.hitlId ?? "", actionId: "allow" });
      await pending;
    } finally {
      restore();
    }
  });
});
