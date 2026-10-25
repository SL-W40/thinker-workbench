/**
 * todo 工具规格：会话级待办的增删改读。
 *
 * 待办独立于计划存在 —— 任何模式都能用它规划步骤而不产出方案；
 * 计划必然产出待办，create_plan 复用同一份列表。
 */
import { defineTool } from "../defineTool";
import { todoTool } from "./execute";

export const todoToolSpec = defineTool({
  name: "todo",
  description:
    "Maintain the session todo list (id / label / status: pending | in_progress | done). Actions: `list` (read current), `add` (append items), `update` (change label/status by id), `complete` (mark ids done), `remove` (drop ids). Use it to plan and track steps in any mode; this list is what the user sees above the composer. Call `list` first if you need existing ids.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "One of: list | add | update | complete | remove.",
      },
      items: {
        type: "array",
        description:
          "For `add`: items to append — objects with `label` (and optional `id`, `status`), or plain strings. For `update`: objects with `id` plus optional `label` / `status`. For `complete` / `remove`: objects with `id` (or plain id strings). Omit for `list`.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Existing todo id (update / complete / remove)." },
            label: { type: "string", description: "Todo description (add / update)." },
            status: {
              type: "string",
              description: "pending | in_progress | done (add / update).",
            },
          },
        },
      },
    },
    required: ["action"],
  },
  execute: todoTool,
});
