/**
 * ChatMode 门禁读 ALS / 入参，不读陈旧进程全局。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildChatModeAddendum, isToolAllowedForChatMode, setChatMode } from "../../src/chatMode";
import { type RunContext, runWithContext } from "../../src/runtime/runContext";

function stubCtx(chatMode: "ask" | "agent" | "multitask"): RunContext {
  return {
    runId: "r1",
    threadId: "t1",
    workspaceRoot: "/tmp",
    chatMode,
    workspaceAccess: "rw",
    allowAiDeleteFiles: true,
    allowAiShell: true,
    allowAiBrowser: true,
    shellApprovalMode: "allowlist",
    shellAllowlist: [],
    shellBlocklist: [],
    shellProfile: null,
    emit: () => {},
    catalog: null,
    selection: { mode: "manual", modelId: "m" },
    routeContext: { userText: "" },
    hitlIds: new Set(),
    taskIds: new Set(),
  };
}

describe("ChatMode ALS", () => {
  it("isToolAllowedForChatMode 优先入参 chatMode", () => {
    setChatMode("agent");
    assert.equal(isToolAllowedForChatMode("shell", { chatMode: "ask" }), false);
    assert.equal(isToolAllowedForChatMode("shell", { chatMode: "agent" }), true);
  });

  it("buildChatModeAddendum 默认读当前帧", async () => {
    setChatMode("agent");
    await runWithContext(stubCtx("multitask"), async () => {
      const text = buildChatModeAddendum();
      assert.match(text, /Multitask/i);
    });
  });
});
