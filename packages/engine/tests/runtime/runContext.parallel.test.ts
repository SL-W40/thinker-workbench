/**
 * 并行 RunContext：交错 await 时 workspace / emit ids 不串。
 */
import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_MODE,
  DEFAULT_SHELL_ALLOWLIST,
  DEFAULT_SHELL_APPROVAL_MODE,
  DEFAULT_WORKSPACE_ACCESS,
} from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { getChatMode } from "../../src/chatMode";
import { buildRunContext } from "../../src/runtime/buildRunContext";
import { runWithContext } from "../../src/runtime/runContext";
import { getRunIds } from "../../src/runtime/runEmit";
import { getWorkspaceRoot } from "../../src/workspace";

describe("RunContext 并行隔离", () => {
  it("交错 await 时 getWorkspaceRoot / getRunIds / getChatMode 不串线", async () => {
    const seenA: string[] = [];
    const seenB: string[] = [];

    const ctxA = buildRunContext({
      runId: "run_a",
      threadId: "thread_a",
      sessionId: "session_a",
      workspaceRoot: "C:\\tmp\\workspace-a",
      chatMode: "ask",
      workspaceAccess: DEFAULT_WORKSPACE_ACCESS,
      shellApprovalMode: DEFAULT_SHELL_APPROVAL_MODE,
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      emit: () => {},
    });
    const ctxB = buildRunContext({
      runId: "run_b",
      threadId: "thread_b",
      sessionId: "session_b",
      workspaceRoot: "C:\\tmp\\workspace-b",
      chatMode: "agent",
      workspaceAccess: DEFAULT_WORKSPACE_ACCESS,
      shellApprovalMode: DEFAULT_SHELL_APPROVAL_MODE,
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      emit: () => {},
    });
    // buildRunContext 会 normalize；测试不依赖目录真实存在（getter 只读字符串）
    void DEFAULT_CHAT_MODE;

    const taskA = runWithContext(ctxA, async () => {
      seenA.push(`${getRunIds()?.runId}:${getWorkspaceRoot()}:${getChatMode()}`);
      await new Promise((r) => setTimeout(r, 30));
      seenA.push(`${getRunIds()?.runId}:${getWorkspaceRoot()}:${getChatMode()}`);
    });
    const taskB = runWithContext(ctxB, async () => {
      await new Promise((r) => setTimeout(r, 10));
      seenB.push(`${getRunIds()?.runId}:${getWorkspaceRoot()}:${getChatMode()}`);
      await new Promise((r) => setTimeout(r, 30));
      seenB.push(`${getRunIds()?.runId}:${getWorkspaceRoot()}:${getChatMode()}`);
    });

    await Promise.all([taskA, taskB]);

    assert.deepEqual(seenA, ["run_a:C:\\tmp\\workspace-a:ask", "run_a:C:\\tmp\\workspace-a:ask"]);
    assert.deepEqual(seenB, [
      "run_b:C:\\tmp\\workspace-b:agent",
      "run_b:C:\\tmp\\workspace-b:agent",
    ]);
  });
});
