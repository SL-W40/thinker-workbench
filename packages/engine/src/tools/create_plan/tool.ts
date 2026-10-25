/**
 * create_plan 工具规格：以结构化参数产出计划（覆盖会话活跃计划）。
 *
 * 计划是状态而非文本 —— 工具参数即真相，正文里不要再复述整份计划。
 */
import { defineTool } from "../defineTool";
import { createPlanTool } from "./execute";

export const createPlanToolSpec = defineTool({
  name: "create_plan",
  description:
    "Creates the plan that is shown to the user as a Plan card. Pass a short title, a one-line description, status, the full todo list (id / label / status) and the complete plan body as markdown. Write the arguments in that order (title first, markdown last) — the card streams in while you generate. The plan is structured state — do NOT repeat the whole plan in your reply; write only a brief summary in the message body.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short plan title shown on the card." },
      description: { type: "string", description: "One-line description of what this plan does." },
      status: {
        type: "string",
        description: "draft | ready | building | done; a finished plan is `ready`.",
      },
      todos: {
        type: "array",
        description:
          "Full todo list. Each item needs a stable id, a short label, and status: pending | in_progress | done.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable todo id." },
            label: { type: "string", description: "Short todo description." },
            status: { type: "string", description: "pending | in_progress | done." },
          },
          required: ["id", "label", "status"],
        },
      },
      markdown: {
        type: "string",
        description:
          "The complete plan body in markdown: goals, ordered steps, risks, and how to verify.",
      },
    },
    required: ["todos", "markdown"],
  },
  execute: createPlanTool,
});
