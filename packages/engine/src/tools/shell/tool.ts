/**
 * shell / shell_await 工具规格。
 */
import { defineTool } from "../defineTool";
import { shellAwaitTool, shellTool } from "./execute";

export const shellToolSpec = defineTool({
  name: "shell",
  description:
    "Run a shell command in the workspace terminal (PTY). Respects Settings shell profile and approval mode. Use working_directory relative to workspace.root. Prefer block_until_ms for long commands; if backgrounded, call shell_await with the returned sessionId.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command line to execute in the configured shell.",
      },
      working_directory: {
        type: "string",
        description: "Optional cwd relative to workspace.root (or absolute when access=full).",
      },
      block_until_ms: {
        type: "number",
        description:
          "Max ms to wait for the command to finish (default 30000). If it is still running (e.g. servers), returns backgrounded=true and keeps the PTY; use shell_await or open the terminal. 0 = return as backgrounded immediately after start.",
      },
    },
    required: ["command"],
  },
  execute: shellTool,
});

export const shellAwaitToolSpec = defineTool({
  name: "shell_await",
  description:
    "Wait for more output or exit from a backgrounded shell session. Optional pattern (regex) returns early when matched in stdout.",
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session id from a prior shell tool result.",
      },
      block_until_ms: {
        type: "number",
        description: "Max wait in ms (default 30000).",
      },
      pattern: {
        type: "string",
        description: "Optional regex; return early when matched in accumulated output.",
      },
    },
    required: ["sessionId"],
  },
  execute: shellAwaitTool,
});
