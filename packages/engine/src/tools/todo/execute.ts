/**
 * todo 工具执行体：维护本轮会话待办镜像，并把变更同步给 UI。
 *
 * 待办是会话级状态（真值在会话记录 chat_sessions.todos_json）：
 * 本轮只改内存镜像 + 发 `todo` 事件，由消费端落库。
 * 计划复用同一份待办 —— create_plan / update_plan 会连带更新它。
 */

import { emitTodos } from "../../runtime/emitHelpers";
import { getRunTodos, setRunTodos } from "../../runtime/runContext";
import { getRunEmitter } from "../../runtime/runEmit";
import type { ToolArgs, ToolExecuteResult } from "../types";
import {
  addTodos,
  completeTodos,
  formatTodos,
  parseTodoAction,
  parseTodoIds,
  parseTodoItems,
  removeTodos,
  snapshotTodos,
  summarizeTodos,
  updateTodos,
} from "./todos";

/** 动作非法时的提示（含合法取值，方便模型自我纠正）。 */
const ACTION_HINT = "todo 的 action 必须是 list / add / update / complete / remove 之一。";

export async function todoTool(args: ToolArgs): Promise<ToolExecuteResult> {
  const action = parseTodoAction(args.action);
  if (!action) return { ok: false, output: ACTION_HINT };

  const current = getRunTodos();

  // list 是只读：把当前待办原样快照给时间线卡片（无增删标注）
  if (action === "list") {
    return { output: formatTodos(current), ui: { todos: current } };
  }

  const items = parseTodoItems(args.items);
  if (items.length === 0) {
    return { ok: false, output: `todo ${action} 需要 items 数组（至少一项）。` };
  }

  let next = current;
  if (action === "add") {
    next = addTodos(current, items);
  } else {
    const ids = parseTodoIds(items);
    if (ids.length === 0) {
      return { ok: false, output: `todo ${action} 的每项都需要 id（用 list 查看现有 id）。` };
    }
    const result =
      action === "update"
        ? updateTodos(current, items)
        : action === "complete"
          ? completeTodos(current, ids)
          : removeTodos(current, ids);
    if (result.missing.length > 0) {
      return {
        ok: false,
        output: `todo ${action} 未找到 id：${result.missing.join("、")}。当前待办：\n${formatTodos(current)}`,
      };
    }
    next = result.todos;
  }

  // 先落本轮镜像，再把全量列表推给 UI（幂等替换）
  setRunTodos(next);
  emitTodos(getRunEmitter(), { todos: next, origin: "todo" });

  const verb = action === "add" ? "新增" : action === "remove" ? "删除" : "更新";
  // 快照 + 增删 id：时间线卡片定格在这一刻，不跟着后续状态变
  const snap = snapshotTodos(current, next);
  return {
    output: `待办已${verb}。${summarizeTodos(next)}`,
    ui: {
      todos: snap.items,
      ...(snap.added.length > 0 ? { todoAdded: snap.added } : {}),
      ...(snap.removed.length > 0 ? { todoRemoved: snap.removed } : {}),
    },
  };
}
