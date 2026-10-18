/**
 * shell / shell_await / shell_write 工具规格。
 */
import { defineTool } from "../defineTool";
import { shellAwaitTool, shellTool, shellWriteTool } from "./execute";

export const shellToolSpec = defineTool({
  name: "shell",
  description:
    "Run a shell command in the workspace. Defaults: await=true waits up to block_until_ms then returns outcome complete|still_running; await=false returns still_running immediately (servers). Use shell_await with sessionId for more output. Prefer exec_mode=auto (short commands use direct non-interactive; await=false uses login PTY).",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "Command line to execute in the configured shell. Avoid interactive/pager commands: prefer non-interactive flags (e.g. git -c core.pager=cat diff --stat, or pipe through cat) and forbid pagers/confirmation prompts (less, more, vim, top, watch, git commit, sudo with prompt, etc.). When await=true use short direct commands; reserve login PTY (await=false) for long-running servers, not for paged output.",
      },
      working_directory: {
        type: "string",
        description: "Optional cwd relative to workspace.root (or absolute when access=full).",
      },
      await: {
        type: "boolean",
        description:
          "Default true. false = return still_running immediately after start (fire-and-forget / servers); then use shell_await when needed.",
      },
      block_until_ms: {
        type: "number",
        description:
          "Soft wait budget in ms when await=true (default from Settings). On timeout returns outcome=still_running and keeps tracking; use shell_await. 0 = still_running immediately.",
      },
      exec_mode: {
        type: "string",
        description:
          "login | direct | auto (default auto). auto: await=false → login PTY; else → direct non-interactive (shell -c / pwsh -Command). direct does not support shell_write.",
      },
    },
    required: ["command"],
  },
  execute: shellTool,
});

export const shellAwaitToolSpec = defineTool({
  name: "shell_await",
  description:
    "Wait for more output or exit from a still_running shell session. Returns outcome complete|still_running. Optional pattern (regex) returns early with wakeReason=pattern.",
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session id from a prior shell tool result.",
      },
      block_until_ms: {
        type: "number",
        description: "Max wait in ms (default from Settings).",
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

export const shellWriteToolSpec = defineTool({
  name: "shell_write",
  description:
    'Write to a still_running login shell session stdin (confirmations, simple prompts, interrupt). For Ctrl+C use data="ctrl+c" or "^C" with submit=false (aliases are normalized to the real control byte). Use secret=true for passwords — user enters via secure prompt; plaintext never appears in the tool result. Not supported for direct exec sessions. To stop a background server, prefer shell kill/session kill over hoping the process exits.',
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session id from a prior shell tool result (login / still_running).",
      },
      data: {
        type: "string",
        description:
          "Text to write. Ignored when secret=true. Short replies (y/n) or control aliases: ctrl+c, ^C, ctrl+d, ctrl+z.",
      },
      submit: {
        type: "boolean",
        description:
          "Default true: append carriage return. Forced false for control characters (ctrl+c etc.).",
      },
      secret: {
        type: "boolean",
        description:
          "If true, prompt the user for a password/secret; do not put secrets in data. Tool result omits plaintext.",
      },
    },
    required: ["sessionId"],
  },
  execute: shellWriteTool,
});
