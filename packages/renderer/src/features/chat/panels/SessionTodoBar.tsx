/**
 * 输入框上方的会话待办条：会话级待办的可折叠概览。
 *
 * 待办独立于计划 —— 任何模式都能规划步骤而不产出方案；有进行中项时自动展开，
 * 让「正在做哪一步」始终可见。
 */
import { ChevronRightIcon } from "@thinker-workbench/design/react";
import { type ChatTodo, todoProgress } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import { TodoList } from "../cards/TodoList";
import "./SessionTodoBar.less";

type Props = {
  /** 会话待办（会话级状态，真值在会话记录）。 */
  todos: readonly ChatTodo[];
  /** 当前是否有 run 在跑：决定进行中项是转圈还是「未完成」。 */
  running?: boolean;
};

export function SessionTodoBar({ todos, running = false }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // 出现进行中项时自动展开：动画与当前步骤不该被折叠藏起来
  useEffect(() => {
    if (todos.some((todo) => todo.status === "in_progress")) setOpen(true);
  }, [todos]);

  if (todos.length === 0) return null;

  const { done, total } = todoProgress(todos);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={`session-todos${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="session-todos__head"
        aria-expanded={open}
        aria-label={open ? t("chat.todos.collapse") : t("chat.todos.expand")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="session-todos__chev" aria-hidden="true">
          <ChevronRightIcon size="sm" open={open} />
        </span>
        <span className="session-todos__title">{t("chat.todos.title")}</span>
        <span className="session-todos__count">
          {t("chat.todos.progress", { done: String(done), total: String(total) })}
        </span>
        <span className="session-todos__bar" aria-hidden="true">
          <span className="session-todos__fill" style={{ width: `${percent}%` }} />
        </span>
      </button>
      {open ? (
        <div className="session-todos__body">
          <TodoList todos={todos} dense running={running} />
        </div>
      ) : null}
    </div>
  );
}
