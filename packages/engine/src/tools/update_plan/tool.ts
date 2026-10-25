/**
 * update_plan 工具规格：执行阶段更新活跃计划的待办与完成状态。
 * 只发事件、不落工作空间；待办列表为全量替换（幂等）。
 */
import { defineTool } from "../defineTool";
import { updatePlanTool } from "./execute";

export const updatePlanToolSpec = defineTool({
  name: "update_plan",
  description:
    "Updates the active plan shown to the user. Pass the FULL todo list (id / label / status) plus optionally the overall status. The list replaces the previous one wholesale, so include every item you still want. Call it as you finish each step so progress stays live.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Plan title shown on the card; omit to keep the current title.",
      },
      status: {
        type: "string",
        description: "Overall plan status: draft | ready | building | done.",
      },
      todos: {
        type: "array",
        description:
          "Full todo list. Each item needs a stable id, a short label, and status: pending | in_progress | done.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable todo id (reuse the id from the plan)." },
            label: { type: "string", description: "Short todo description." },
            status: { type: "string", description: "pending | in_progress | done." },
          },
          required: ["id", "label", "status"],
        },
      },
    },
    required: ["todos"],
  },
  execute: updatePlanTool,
});
