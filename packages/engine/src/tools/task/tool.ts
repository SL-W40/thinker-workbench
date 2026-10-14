/**
 * Task / task_await / task_cancel 工具规格。
 */
import { defineTool } from "../defineTool";
import { runTaskAwaitTool, runTaskCancelTool, runTaskTool } from "./execute";

export const taskToolSpec = defineTool({
  name: "Task",
  description:
    "Delegate work to a named subagent. Argument order matters for streaming UX: emit subagent, then a short unique title, then prompt (never put a long prompt first). Decide await yourself: await=true blocks until the subagent finishes and returns its summary; await=false (or background=true) returns a taskId immediately — then call task_await when you need the result (same pattern as shell / shell_await). Prefer await=false for independent parallel workstreams, then task_await each taskId before summarizing. Use task_cancel to drop one background task without stopping the parent run. Do not invent a status subagent.",
  parameters: {
    type: "object",
    properties: {
      subagent: {
        type: "string",
        description:
          "Registered subagent name (see system list). Must be the first JSON field; write it before title/prompt.",
      },
      title: {
        type: "string",
        description:
          'Short UI label for this task (≤60 chars), unique among parallel Tasks. Emit right after subagent, before prompt. Example: "Map Customize IPC".',
      },
      prompt: {
        type: "string",
        description:
          "Full task description and necessary context for the subagent. Write after subagent and title.",
      },
      model: {
        type: "string",
        description: "Optional model id, or 'inherit' to use the parent model.",
      },
      await: {
        type: "boolean",
        description:
          "If true, wait for the subagent to finish in this tool call. If false, return taskId immediately and continue in background. When omitted, agents marked background-ok default to not awaiting.",
      },
      background: {
        type: "boolean",
        description:
          "Deprecated alias: true means await=false (return taskId immediately). Prefer the await parameter.",
      },
    },
    required: ["subagent", "prompt"],
  },
  execute: runTaskTool,
});

export const taskAwaitToolSpec = defineTool({
  name: "task_await",
  description:
    "Wait for a background Task (from Task with await=false / background=true) to finish. Pass the returned taskId. If still running after block_until_ms, returns status=running with ok=true — call again when ready. Use this before summarizing parallel subagent work; do not re-invoke Task to poll.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "taskId from a prior Task tool result.",
      },
      block_until_ms: {
        type: "number",
        description:
          "Max ms to wait for the task to finish (default 30000). 0 = return current status immediately without waiting.",
      },
    },
    required: ["taskId"],
  },
  execute: runTaskAwaitTool,
});

export const taskCancelToolSpec = defineTool({
  name: "task_cancel",
  description:
    "Cancel one background Task by taskId without stopping the parent run or other Tasks. Use when a parallel workstream is no longer needed. Idempotent if already finished/failed/cancelled. Prefer this over inventing a status subagent.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "taskId from a prior Task (await=false / background=true) result.",
      },
    },
    required: ["taskId"],
  },
  execute: runTaskCancelTool,
});
