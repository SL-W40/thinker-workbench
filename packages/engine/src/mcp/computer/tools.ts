/**
 * 内置 Computer MCP 的工具定义与分发。
 */
import { BUILTIN_COMPUTER_MCP_ID, BUILTIN_COMPUTER_MCP_NAME } from "@thinker-workbench/shared";
import type { ToolArgs, ToolResult } from "../../tools/types";
import { click, moveMouse, notWindows, pressKey, scroll, typeText } from "./actions";
import { parseScreenInfo, runPowerShell, SCREEN_INFO_PS, screenInfoText } from "./powershell";
import { screenshot } from "./screenshot";

/** 内置 server 的稳定 id（与 shared 常量一致）。 */
export const COMPUTER_MCP_ID = BUILTIN_COMPUTER_MCP_ID;
/** 内置 server 展示名。 */
export const COMPUTER_MCP_NAME = BUILTIN_COMPUTER_MCP_NAME;

/** 模型可见工具定义（轻量 JSON Schema）。 */
export type ComputerToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** 内置 Computer MCP 的工具定义（喂给模型）。 */
export function computerToolDefs(): ComputerToolDef[] {
  return [
    {
      name: "computer_screenshot",
      description:
        "Capture the entire Windows desktop (all monitors) as a PNG. Returns the image plus cursor position and screen geometry. Use it to see the current screen state before acting.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "computer_screen_info",
      description:
        "Get screen geometry (virtual desktop bounds and size) and current cursor position. No image; cheap.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "computer_move_mouse",
      description: "Move the mouse cursor to absolute screen coordinates.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", description: "Absolute X in screen pixels." },
          y: { type: "integer", description: "Absolute Y in screen pixels." },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_click",
      description:
        "Click a mouse button at absolute coordinates (current cursor position if x/y omitted).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", description: "Absolute X in screen pixels." },
          y: { type: "integer", description: "Absolute Y in screen pixels." },
          button: {
            type: "string",
            enum: ["left", "right", "middle"],
            description: "Mouse button; defaults to left.",
          },
          clicks: {
            type: "integer",
            enum: [1, 2],
            description: "1 = single click, 2 = double click.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "computer_type",
      description: "Type text at the current focus (keyboard).",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Literal text to type." } },
        required: ["text"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_key",
      description:
        "Press a key or combo, e.g. enter, tab, escape, f5, ctrl+c, alt+tab, shift+tab. The Windows key is not supported.",
      parameters: {
        type: "object",
        properties: { key: { type: "string", description: "Key or combo." } },
        required: ["key"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_scroll",
      description:
        "Scroll the wheel at the current cursor position. Positive = up, negative = down.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "integer", description: "Notches; positive up, negative down." },
        },
        required: ["amount"],
        additionalProperties: false,
      },
    },
  ];
}

/** 执行一个内置 computer 工具。 */
export async function callComputerTool(
  name: string,
  args: ToolArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (process.platform !== "win32") return notWindows();
  if (signal?.aborted) return { ok: false, output: "Cancelled." };
  try {
    switch (name) {
      case "computer_screen_info": {
        const stdout = await runPowerShell(SCREEN_INFO_PS);
        const info = parseScreenInfo(stdout);
        if (!info) return { ok: false, output: "failed to read screen info" };
        return { ok: true, output: screenInfoText(info) };
      }
      case "computer_screenshot":
        return await screenshot();
      case "computer_move_mouse":
        return await moveMouse(args);
      case "computer_click":
        return await click(args);
      case "computer_type":
        return await typeText(args);
      case "computer_key":
        return await pressKey(args);
      case "computer_scroll":
        return await scroll(args);
      default:
        return { ok: false, output: `Unknown computer tool: ${name}` };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, output: `computer error: ${error}` };
  }
}
