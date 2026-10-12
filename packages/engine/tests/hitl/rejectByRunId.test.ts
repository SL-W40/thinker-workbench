/**
 * HITL cancel 按 runId 作用域。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { rejectHitlByRunId, requestHitl } from "../../src/hitl/requestHitl";
import { runWithContext } from "../../src/runtime/runContext";
import { buildRunContext } from "../../src/runtime/buildRunContext";
import {
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
} from "@thinker-workbench/shared";

describe("rejectHitlByRunId", () => {
  it("只拒绝目标 run 的 pending HITL", async () => {
    const prev = (process as NodeJS.Process & { parentPort?: unknown }).parentPort;
    (process as NodeJS.Process & { parentPort?: unknown }).parentPort = {
      postMessage() {},
      on() {},
    };
    const ctxA = buildRunContext({
      runId: "run_hitl_a",
      threadId: "th_a",
      workspaceRoot: "C:\\tmp\\a",
      workspaceAccess: DEFAULT_WORKSPACE_ACCESS,
      shellApprovalMode: DEFAULT_SHELL_APPROVAL_MODE,
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      emit: () => {},
    });
    const ctxB = buildRunContext({
      runId: "run_hitl_b",
      threadId: "th_b",
      workspaceRoot: "C:\\tmp\\b",
      workspaceAccess: DEFAULT_WORKSPACE_ACCESS,
      shellApprovalMode: DEFAULT_SHELL_APPROVAL_MODE,
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      emit: () => {},
    });

    const pA = runWithContext(ctxA, () =>
      requestHitl({ kind: "shell_approval", title: "a", body: "a", actions: [] }),
    );
    const pB = runWithContext(ctxB, () =>
      requestHitl({ kind: "shell_approval", title: "b", body: "b", actions: [] }),
    );

    rejectHitlByRunId("run_hitl_a", "cancelled-a");

    await assert.rejects(pA, /cancelled-a/);
    // B 仍挂起：用短超时证明未被拒，再清掉
    let bSettled = false;
    void pB.then(
      () => {
        bSettled = true;
      },
      () => {
        bSettled = true;
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(bSettled, false);
    rejectHitlByRunId("run_hitl_b", "cancelled-b");
    await assert.rejects(pB, /cancelled-b/);
    (process as NodeJS.Process & { parentPort?: unknown }).parentPort = prev;
  });
});
