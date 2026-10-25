/**
 * 待办卡片：时间线内一次 `todo` 工具调用的呈现形态。
 *
 * 关键是把「读」和「写」分开：`list` 只读取会话待办，其余动作都会改它。
 * 动作与受影响条目由引擎在时间线事件里结构化带上（`step.todo`），不做文本反解。
 */
import { Badge, CheckIcon, LanesIcon } from "@thinker-workbench/design/react";
import { type ChatTimelineTodoHint, isTodoReadAction } from "@thinker-workbench/shared";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import { TodoList } from "./TodoList";
import "./TodoCard.less";

/** 动作 → 文案键。 */
const ACTION_KEY: Record<ChatTimelineTodoHint["action"], MessageKey> = {
  list: "chat.todoCard.action.list",
  add: "chat.todoCard.action.add",
  update: "chat.todoCard.action.update",
  complete: "chat.todoCard.action.complete",
  remove: "chat.todoCard.action.remove",
};

type Props = {
  /** `todo` 工具的结构化提示（缺失时降级为纯动作行）。 */
  hint?: ChatTimelineTodoHint;
  /** 工具仍在跑。 */
  running?: boolean;
  /** 工具失败（ok===false）。 */
  failed?: boolean;
};

export function TodoCard({ hint, running = false, failed = false }: Props) {
  const t = useT();
  const action = hint?.action;
  const read = action ? isTodoReadAction(action) : false;
  // 去重后按文案作 key：同一批条目文案重复时也能稳定渲染
  const labels = Array.from(new Set(hint?.labels ?? []));
  const count = hint?.count ?? 0;
  const more = Math.max(0, count - labels.length);
  const snapshot = hint?.items ?? [];
  const status = running
    ? t("chat.toolRunning")
    : failed
      ? t("chat.toolFailed")
      : t("chat.toolDone");

  return (
    <section className="todo-card" aria-label={t("chat.toolNames.todo")}>
      <header className="todo-card__head">
        <span className="todo-card__kicker">
          {read ? <LanesIcon size="sm" /> : <CheckIcon size="sm" />}
          {t("chat.toolNames.todo")}
        </span>
        <span className="todo-card__tags">
          {/* 读 / 写徽标：这次调用到底有没有改会话待办 */}
          <Badge variant={read ? "neutral" : "accent"}>
            {t(read ? "chat.todoCard.read" : "chat.todoCard.write")}
          </Badge>
          {action ? <span className="todo-card__action">{t(ACTION_KEY[action])}</span> : null}
          {!read && count > 0 ? (
            <span className="todo-card__count">
              {t("chat.todoCard.items", { n: String(count) })}
            </span>
          ) : null}
          <span className={`todo-card__status${failed ? " is-err" : ""}`}>{status}</span>
        </span>
      </header>

      {/*
        正文优先展示调用后的待办快照（那一刻的定格，不跟后续状态变），
        新增 / 删除的条目用颜色标注；拿不到快照时才退回条目文案 chips。
      */}
      {snapshot.length > 0 ? (
        <div className="todo-card__list">
          <TodoList
            todos={snapshot}
            dense
            frozen
            addedIds={hint?.added}
            removedIds={hint?.removed}
          />
        </div>
      ) : labels.length > 0 ? (
        <ul className="todo-card__items">
          {labels.map((label) => (
            <li key={label} className="todo-card__item">
              {label}
            </li>
          ))}
          {more > 0 ? (
            <li className="todo-card__item is-more">
              {t("chat.todoCard.more", { n: String(more) })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
