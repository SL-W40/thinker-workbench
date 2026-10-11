/**
 * task_await / Task 等待语义单测。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isToolAllowedForChatMode, setChatMode } from "../../../src/chatMode";
import { runTaskAwaitTool } from "../../../src/tools/task/execute";

describe("task_await", () => {
  it("unknown taskId 返回 ok:false", async () => {
    const result = await runTaskAwaitTool(
      { taskId: "task_missing" },
      { workspaceRoot: "", signal: new AbortController().signal },
    );
    assert.equal(result && typeof result === "object" && "ok" in result && result.ok, false);
    assert.match(String((result as { output: string }).output), /Unknown taskId/);
  });

  it("ChatMode：ask 禁用 Task 与 task_await；multitask 允许", () => {
    setChatMode("ask");
    assert.equal(isToolAllowedForChatMode("Task"), false);
    assert.equal(isToolAllowedForChatMode("task_await"), false);

    setChatMode("multitask");
    assert.equal(isToolAllowedForChatMode("Task"), true);
    assert.equal(isToolAllowedForChatMode("task_await"), true);

    setChatMode("agent");
    assert.equal(isToolAllowedForChatMode("task_await"), true);
    assert.equal(isToolAllowedForChatMode("task_await", { allowTask: false }), false);
  });
});
