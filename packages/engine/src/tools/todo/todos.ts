/**
 * todo 工具的待办操作：纯函数，便于单测。
 *
 * 待办是会话级状态；这里只做「给定当前列表 + 入参 → 新列表」的变换，
 * 读写本轮镜像与发事件由 `./execute` 负责。
 */
import {
  type ChatTodo,
  type ChatTodoAction,
  normalizeTodos,
  TODO_ACTIONS,
  todoProgress,
} from "@thinker-workbench/shared";

/** todo 工具的动作（真值在 shared，时间线提示与工具实现共用同一套取值）。 */
export type TodoAction = ChatTodoAction;

export const TODO_ACTIONS_LIST: readonly TodoAction[] = TODO_ACTIONS;

export { TODO_ACTIONS };

/** 解析动作；非法返回 null。 */
export function parseTodoAction(value: unknown): TodoAction | null {
  if (typeof value !== "string") return null;
  const action = value.trim() as TodoAction;
  return TODO_ACTIONS.includes(action) ? action : null;
}

/** 解析入参里的待办项数组（允许直接给字符串当 label）。 */
export function parseTodoItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? { label: item } : item)) as Array<
    Record<string, unknown>
  >;
}

/** 下一个稳定 id：沿用 `t{n}` 约定，避开现有 id。 */
export function nextTodoId(todos: readonly ChatTodo[]): string {
  let max = 0;
  for (const todo of todos) {
    const m = /^t(\d+)$/.exec(todo.id);
    if (m?.[1]) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `t${max + 1}`;
}

/** 取出入参里待操作的 id（去重、去空）。 */
export function parseTodoIds(items: Array<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    // 也允许直接传字符串数组当 id
    if (!id) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 追加待办：id 缺失或撞号时按 `t{n}` 续号。 */
export function addTodos(
  current: readonly ChatTodo[],
  items: Array<Record<string, unknown>>,
): ChatTodo[] {
  const list = [...current];
  for (const row of normalizeTodos(items)) {
    const taken = list.some((todo) => todo.id === row.id);
    const id = taken || !row.id ? nextTodoId(list) : row.id;
    list.push({ ...row, id });
  }
  return list;
}

/** 更新待办：按 id 改 label / status；未给的字段保持原值。 */
export function updateTodos(
  current: readonly ChatTodo[],
  items: Array<Record<string, unknown>>,
): { todos: ChatTodo[]; missing: string[] } {
  const byId = new Map(items.map((item) => [String(item.id ?? "").trim(), item]));
  const missing: string[] = [];
  const todos = current.map((todo) => {
    const row = byId.get(todo.id);
    if (!row) return todo;
    byId.delete(todo.id);
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : todo.label;
    const status = typeof row.status === "string" ? row.status : todo.status;
    return { ...todo, label, status } as ChatTodo;
  });
  for (const id of byId.keys()) {
    if (id) missing.push(id);
  }
  return { todos: normalizeTodos(todos), missing };
}

/** 完成待办：按 id 置 done。 */
export function completeTodos(
  current: readonly ChatTodo[],
  ids: readonly string[],
): { todos: ChatTodo[]; missing: string[] } {
  const wanted = new Set(ids);
  const done = new Set<string>();
  const todos = current.map((todo) => {
    if (!wanted.has(todo.id)) return todo;
    done.add(todo.id);
    return { ...todo, status: "done" as const };
  });
  return { todos, missing: ids.filter((id) => !done.has(id)) };
}

/** 删除待办：按 id 移除。 */
export function removeTodos(
  current: readonly ChatTodo[],
  ids: readonly string[],
): { todos: ChatTodo[]; missing: string[] } {
  const wanted = new Set(ids);
  const hit = new Set<string>();
  const todos = current.filter((todo) => {
    if (!wanted.has(todo.id)) return true;
    hit.add(todo.id);
    return false;
  });
  return { todos, missing: ids.filter((id) => !hit.has(id)) };
}

/** 一次调用的时间线快照：调用后的列表 + 增删 id。 */
export type TodoSnapshot = {
  /** 展示用列表：删除的项仍留在原位（标红），新增的接在末尾（标绿）。 */
  items: ChatTodo[];
  added: string[];
  removed: string[];
};

/**
 * 对比调用前后的两份待办，产出时间线卡片要的快照。
 *
 * 删除的项不能只给 id —— 它已不在新列表里，卡片要显示「删了哪条」就得留一行。
 */
export function snapshotTodos(
  before: readonly ChatTodo[],
  after: readonly ChatTodo[],
): TodoSnapshot {
  const afterById = new Map(after.map((todo) => [todo.id, todo]));
  const beforeIds = new Set(before.map((todo) => todo.id));
  const items: ChatTodo[] = [];
  const removed: string[] = [];
  // 原顺序铺开：还在的用新值，被删的保留旧值等卡片标红
  for (const todo of before) {
    const next = afterById.get(todo.id);
    if (next) {
      items.push(next);
      continue;
    }
    items.push(todo);
    removed.push(todo.id);
  }
  const added: string[] = [];
  for (const todo of after) {
    if (beforeIds.has(todo.id)) continue;
    items.push(todo);
    added.push(todo.id);
  }
  return { items, added, removed };
}

/** 待办列表文本（给模型看的结果，同时便于用户核对）。 */
export function formatTodos(todos: readonly ChatTodo[]): string {
  if (todos.length === 0) return "当前没有待办。";
  const { done, total } = todoProgress(todos);
  const lines = todos.map((todo) => `- [${todo.status}] ${todo.id} ${todo.label}`);
  return [`当前待办 ${done}/${total} 已完成：`, ...lines].join("\n");
}

/** 一句话进度后缀，供各动作的输出复用。 */
export function summarizeTodos(todos: readonly ChatTodo[]): string {
  const { done, total } = todoProgress(todos);
  return `当前 ${total} 项，已完成 ${done} 项。`;
}
