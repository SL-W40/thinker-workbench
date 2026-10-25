/**
 * 会话待办领域模型：独立于计划的会话级结构化状态。
 *
 * 待办不一定来自计划 —— agent 或其它模式也能用 `todo` 工具自己规划步骤、不产生方案；
 * 反过来，计划一定产出待办，`create_plan` 复用同一套结构与工具。
 * 真值是工具调用给出的结构化参数 / 会话记录里的 todos 字段，不做任何文本解析。
 */
import type { ChatPlanTodo, ChatPlanTodoStatus } from "./message";

/** 会话待办项：与计划待办同构，便于计划复用同一套展示与更新逻辑。 */
export type ChatTodo = ChatPlanTodo;

/** 单条待办的状态。 */
export type ChatTodoStatus = ChatPlanTodoStatus;

/** 待办状态的合法取值。 */
export const TODO_STATUSES: readonly ChatTodoStatus[] = ["pending", "in_progress", "done"];

/** 判定是否为合法待办状态。 */
export function isTodoStatus(value: unknown): value is ChatTodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value);
}

/** `todo` 工具的动作；`list` 只读，其余写入会话待办。 */
export const TODO_ACTIONS = ["list", "add", "update", "complete", "remove"] as const;

/** `todo` 工具动作的类型。 */
export type ChatTodoAction = (typeof TODO_ACTIONS)[number];

/** 判定是否为合法 todo 动作。 */
export function isTodoAction(value: unknown): value is ChatTodoAction {
  return typeof value === "string" && (TODO_ACTIONS as readonly string[]).includes(value);
}

/** `list` 是唯一只读动作：不改动会话待办。 */
export function isTodoReadAction(action: ChatTodoAction): boolean {
  return action === "list";
}

/**
 * `todo` 工具在时间线上的结构化提示：动作 + 受影响条目。
 * 让时间线能直接区分「读（查看）」与「写（新增 / 更新 / 完成 / 删除）」，
 * 无需从工具名或输出文本猜。
 */
export type ChatTimelineTodoHint = {
  action: ChatTodoAction;
  /** 受影响条目数（缺 items 时可能没有）。 */
  count?: number;
  /** 受影响条目的文案（已截断，无快照时的降级展示；超出部分用 count 折算）。 */
  labels?: string[];
  /** 本次调用后的待办快照 —— 是那一刻的定格，不跟着后续状态变更走。 */
  items?: ChatTodo[];
  /** 相对调用前新增的条目 id（绿色标注）。 */
  added?: string[];
  /** 相对调用前被删除的条目 id（红色标注）。 */
  removed?: string[];
};

/**
 * 校验并规范化待办列表（工具入参）：丢弃缺 label 的项，缺 id 按序补 `t{n}`，
 * 状态非法回落 pending —— 保证写进会话的都是合法结构。
 */
export function normalizeTodos(value: unknown): ChatTodo[] {
  if (!Array.isArray(value)) return [];
  const out: ChatTodo[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const raw = item as { id?: unknown; label?: unknown; status?: unknown };
    if (typeof raw.label !== "string" || !raw.label.trim()) return;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `t${index + 1}`;
    out.push({
      id,
      label: raw.label.trim(),
      status: isTodoStatus(raw.status) ? raw.status : "pending",
    });
  });
  return out;
}

/** 未完成（含进行中）的待办：判断「旧账未清」用。 */
export function unfinishedTodos(todos: readonly ChatTodo[]): ChatTodo[] {
  return todos.filter((todo) => todo.status !== "done");
}

/** 进度：已完成数 / 总数。 */
export function todoProgress(todos: readonly ChatTodo[]): { done: number; total: number } {
  return {
    done: todos.filter((todo) => todo.status === "done").length,
    total: todos.length,
  };
}

/**
 * 合并待办：把 base 里未完成的项接到 incoming 前面，按 id 去重（incoming 优先）。
 * 用于新计划落地时的「合并旧待办」分支 —— 旧账排在前面先做完。
 */
export function mergeTodos(base: readonly ChatTodo[], incoming: readonly ChatTodo[]): ChatTodo[] {
  const ids = new Set(incoming.map((todo) => todo.id));
  const carried = base.filter((todo) => todo.status !== "done" && !ids.has(todo.id));
  return [...carried, ...incoming];
}
