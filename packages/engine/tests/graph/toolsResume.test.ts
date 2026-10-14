/**
 * Resume 防重放：reuse / interrupt 分类文案 / started 合并。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  appendStartedToolCallId,
  classifyToolForInterrupt,
  findToolResultMessage,
  interruptedToolBody,
  interruptedToolMessage,
  resolvePendingToolAction,
} from "../../src/graph/nodes/toolsResume";
import type { ChatToolCall } from "../../src/model/types";

function call(id: string, name: string): ChatToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: "{}" },
  };
}

describe("toolsResume", () => {
  it("findToolResultMessage 按 callId 查找", () => {
    const messages = [
      { role: "assistant" as const, content: null, tool_calls: [call("c1", "read_file")] },
      { role: "tool" as const, tool_call_id: "c1", content: "[tool:read_file ok]\nok" },
    ];
    assert.equal(findToolResultMessage(messages, "c1")?.tool_call_id, "c1");
    assert.equal(findToolResultMessage(messages, "missing"), undefined);
  });

  it("有结果 → reuse；已开工无结果 → interrupt；否则 run", () => {
    const withResult = {
      messages: [{ role: "tool" as const, tool_call_id: "a", content: "done" }],
      startedToolCallIds: ["a"],
    };
    assert.equal(resolvePendingToolAction(withResult, call("a", "shell")), "reuse");

    const started = {
      messages: [] as { role: "tool"; tool_call_id: string; content: string }[],
      startedToolCallIds: ["b"],
    };
    assert.equal(resolvePendingToolAction(started, call("b", "edit_file")), "interrupt");

    const fresh = { messages: [], startedToolCallIds: [] as string[] };
    assert.equal(resolvePendingToolAction(fresh, call("c", "read_file")), "run");
  });

  it("interrupt 文案按工具类区分", () => {
    assert.equal(classifyToolForInterrupt("shell"), "shell");
    assert.equal(classifyToolForInterrupt("edit_file"), "mutate_file");
    assert.equal(classifyToolForInterrupt("Task"), "task");
    assert.equal(classifyToolForInterrupt("read_file"), "default");

    const shellBody = interruptedToolBody("shell");
    assert.match(shellBody, /PTY|session/i);
    assert.match(shellBody, /do not blindly replay/i);

    const editBody = interruptedToolBody("edit_file");
    assert.match(editBody, /Read the file/i);
    assert.doesNotMatch(editBody, /outcome is unknown/i);

    const msg = interruptedToolMessage(call("x", "write_file"));
    assert.equal(msg.role, "tool");
    assert.equal(msg.tool_call_id, "x");
    assert.match(msg.content ?? "", /^\[tool:write_file error\]/);
  });

  it("appendStartedToolCallId 去重", () => {
    assert.deepEqual(appendStartedToolCallId([], "a"), ["a"]);
    assert.deepEqual(appendStartedToolCallId(["a"], "a"), ["a"]);
    assert.deepEqual(appendStartedToolCallId(["a"], "b"), ["a", "b"]);
  });
});
