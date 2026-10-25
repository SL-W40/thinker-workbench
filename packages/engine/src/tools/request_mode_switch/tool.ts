/**
 * request_mode_switch 工具规格。description / parameters 面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { requestModeSwitchTool } from "./execute";

export const requestModeSwitchToolSpec = defineTool({
  name: "request_mode_switch",
  description: [
    "Ask the user to switch this session's chat mode, and wait for their answer before continuing.",
    "Use it when the current mode cannot do what the user now asks for — e.g. in Plan or Ask mode when they want the plan implemented, files edited, or commands run — instead of only telling them to switch modes in chat text.",
    "Do not call it for the mode you are already in, to switch models, or to ask anything else. One request is enough: if the user declines, keep working within the current mode.",
    "If the user agrees, the new mode takes effect for this run immediately (its tools become available) — continue the task without asking again.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description:
          "Mode to switch to: agent | plan | debug | ask | multitask. Use `agent` when the user wants the plan implemented.",
      },
      reason: {
        type: "string",
        description: "One short sentence telling the user why the switch is needed.",
      },
    },
    required: ["target"],
  },
  execute: requestModeSwitchTool,
});
