/**
 * 待办列表（只读）：有序列表 + 状态标记，进行中带旋转动画。
 *
 * 计划面板与输入框上方的会话待办条共用同一套视觉 —— 待办是会话级能力，
 * 计划只是它的一个来源，展示必须一致。
 *
 * `running` 决定进行中项是否真的在转：run 已结束而模型没把最后一项标完成时，
 * 状态真值仍是 in_progress，这里只把它降级显示为「未完成」并停转。
 */
import type { ChatTodo } from "@thinker-workbench/shared";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import "./TodoList.less";

/** 待办状态 → 文案键。 */
const STATUS_KEY: Record<ChatTodo["status"], MessageKey> = {
  pending: "chat.todos.status.pending",
  in_progress: "chat.todos.status.in_progress",
  done: "chat.todos.status.done",
};

type Props = {
  todos: readonly ChatTodo[];
  /** 区块小标题；缺省不渲染（由外层自带标题时省略）。 */
  title?: string;
  /** 紧凑模式：会话待办条用，减少上下留白。 */
  dense?: boolean;
  /** 只显示前若干项（会话条折叠时用）。 */
  limit?: number;
  /**
   * 当前是否有 run 在执行。
   * 默认 false —— 不传即视为「没有 run 在跑」：进行中项停转并显示「未完成」，
   * 避免对话结束后仍留一个永远在转的圈。
   */
  running?: boolean;
  /**
   * 历史快照（时间线卡片用）：保留当时的状态文案，但一律不播动画。
   * 与「停摆」的区别：停摆是「现在没在跑且没收尾」，快照是「那一刻的定格」。
   */
  frozen?: boolean;
  /** 本次调用新增的条目 id（绿色标注）。 */
  addedIds?: readonly string[];
  /** 本次调用删除的条目 id（红色标注）。 */
  removedIds?: readonly string[];
};

export function TodoList({
  todos,
  title,
  dense = false,
  limit,
  running = false,
  frozen = false,
  addedIds,
  removedIds,
}: Props) {
  const t = useT();
  if (todos.length === 0) return null;
  const shown = typeof limit === "number" ? todos.slice(0, limit) : todos;
  const added = new Set(addedIds ?? []);
  const removed = new Set(removedIds ?? []);
  return (
    <div className={`todo-list${dense ? " is-dense" : ""}`}>
      {title ? <div className="todo-list__title">{title}</div> : null}
      <ol className="todo-list__ol">
        {shown.map((todo, index) => {
          // 停摆：状态仍是 in_progress，但本轮已经收尾 —— 只显示「未完成」，不再转圈
          const stalled = todo.status === "in_progress" && !running && !frozen;
          // 快照 / 停摆都不播动画，只有真在跑才转
          const spin = todo.status === "in_progress" && running;
          const flag = added.has(todo.id) ? " is-added" : removed.has(todo.id) ? " is-removed" : "";
          return (
            <li
              key={todo.id}
              className={`todo-item is-${todo.status}${spin ? "" : " is-static"}${stalled ? " is-stalled" : ""}${flag}`}
            >
              <span className="todo-item__order">{index + 1}</span>
              {/* 状态标记用内联 SVG：小尺寸下描边比 CSS 拼的勾清晰 */}
              <span className="todo-item__mark" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
                  <circle className="todo-item__ring" cx="6" cy="6" r="4.6" />
                  {todo.status === "done" ? (
                    <path className="todo-item__check" d="M3.7 6.3 5.2 7.7 8.4 4.4" />
                  ) : null}
                </svg>
              </span>
              <span className="todo-item__label">{todo.label}</span>
              <span className="todo-item__status">
                {t(stalled ? "chat.todos.status.unfinished" : STATUS_KEY[todo.status])}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
