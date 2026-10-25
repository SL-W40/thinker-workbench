/**
 * update_plan 执行体：把模型给出的全量待办与状态推成 plan 事件。
 * 只经事件流更新会话里的活跃计划，不落用户工作空间。
 */

import type { ChatPlanUpdateHint, ChatTodo } from "@thinker-workbench/shared";
import { isPlanStatus, normalizeTodos } from "@thinker-workbench/shared";
import { planIdForSession } from "../../plan/planId";
import { emitPlan, emitTodos } from "../../runtime/emitHelpers";
import { getRunTodos, planOwnsTodos, setRunTodos } from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import type { ToolArgs, ToolExecuteResult } from "../types";

/** 每类变更最多带几条文案（卡片一行只展示前几条，多出来的按数量折算）。 */
const MAX_LABELS = 4;

/**
 * 对比更新前后的待办，得出「这次动了哪几步」。
 *
 * 全量替换的语义下，光看新列表看不出变化：完成 / 新增 / 删除 / 退回分开给，
 * 让时间线一行就能说清更新了什么。
 */
export function planUpdateHint(
  before: readonly ChatTodo[],
  after: readonly ChatTodo[],
): ChatPlanUpdateHint {
  const beforeById = new Map(before.map((todo) => [todo.id, todo]));
  const afterIds = new Set(after.map((todo) => todo.id));
  const completed: string[] = [];
  const reopened: string[] = [];
  const added: string[] = [];
  for (const todo of after) {
    const prev = beforeById.get(todo.id);
    if (!prev) {
      added.push(todo.label);
      continue;
    }
    if (todo.status === "done" && prev.status !== "done") completed.push(todo.label);
    else if (todo.status !== "done" && prev.status === "done") reopened.push(todo.label);
  }
  const removed = before.filter((todo) => !afterIds.has(todo.id)).map((todo) => todo.label);
  return {
    total: after.length,
    done: after.filter((todo) => todo.status === "done").length,
    ...(completed.length > 0 ? { completed: completed.slice(0, MAX_LABELS) } : {}),
    ...(added.length > 0 ? { added: added.slice(0, MAX_LABELS) } : {}),
    ...(removed.length > 0 ? { removed: removed.slice(0, MAX_LABELS) } : {}),
    ...(reopened.length > 0 ? { reopened: reopened.slice(0, MAX_LABELS) } : {}),
  };
}

/**
 * 更新活跃计划：待办为全量替换（幂等），状态缺省视为 building。
 * 无 emitter（不在 run 内）时仍返回成功文本，避免打断模型节奏。
 */
export async function updatePlanTool(args: ToolArgs): Promise<ToolExecuteResult> {
  if (!Array.isArray(args.todos)) {
    return { ok: false, output: "update_plan 需要 todos 数组；传空数组表示清空待办。" };
  }
  const todos = normalizeTodos(args.todos);
  const status = isPlanStatus(args.status) ? args.status : "building";
  // 标题可选：不给时由消费端沿用既有标题
  const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : undefined;
  // 计划拥有会话待办时，run 里的待办就是上一版计划 —— 拿它算这次改了哪几步。
  // 两份独立时不动会话待办，也就没有可信的「上一版」，只给进度。
  const ownsTodos = planOwnsTodos();
  const prevTodos = ownsTodos ? getRunTodos() : [];
  emitPlan(getRunEmitter(), {
    phase: "updated",
    planId: planIdForSession(getRunIds()?.sessionId),
    ...(title ? { title } : {}),
    status,
    todos,
  });
  // 计划拥有会话待办时同步过去，让输入框上方与计划保持同一份进度；
  // 「保留独立」分支下计划与会话各有一份，此处不动会话待办。
  if (ownsTodos) {
    setRunTodos(todos);
    emitTodos(getRunEmitter(), { todos, origin: "update_plan" });
  }
  const hint = planUpdateHint(prevTodos, todos);
  const done = hint.done;
  return {
    output: `计划已更新：status=${status}，待办 ${done}/${todos.length} 已完成。`,
    ui: { planUpdate: hint },
  };
}
