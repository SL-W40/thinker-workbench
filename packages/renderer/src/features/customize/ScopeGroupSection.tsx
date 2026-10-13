/**
 * Customize 内按作用域展开的分组：标题栏 + 添加 + 空状态 / 内容。
 */
import { Button, ChevronRightIcon, EmptyState } from "@thinker-workbench/design/react";
import { type ReactNode, useState } from "react";

type Props = {
  title: string;
  count: number;
  /** 默认展开。 */
  defaultOpen?: boolean;
  addLabel: string;
  onAdd: () => void;
  emptyTitle: string;
  emptyBody: string;
  /** 是否为空（显示 EmptyState）。 */
  isEmpty: boolean;
  children?: ReactNode;
  /** 标题栏右侧、添加按钮旁的额外操作。 */
  headerExtra?: ReactNode;
};

/** 可折叠作用域分组。 */
export function ScopeGroupSection({
  title,
  count,
  defaultOpen = true,
  addLabel,
  onAdd,
  emptyTitle,
  emptyBody,
  isEmpty,
  children,
  headerExtra,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`customize-scope-group${open ? " is-open" : ""}`}>
      <header className="customize-scope-group__head">
        <button
          type="button"
          className="customize-scope-group__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRightIcon open={open} size="sm" />
          <span className="customize-scope-group__title">{title}</span>
          <span className="customize-scope-group__count">{count}</span>
        </button>
        <div className="customize-scope-group__actions">
          {headerExtra}
          <Button size="sm" variant="primary" onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      </header>
      {open ? (
        <div className="customize-scope-group__body">
          {isEmpty ? (
            <EmptyState
              className="customize-scope-group__empty"
              title={emptyTitle}
              description={emptyBody}
              action={
                <Button size="sm" variant="primary" onClick={onAdd}>
                  {addLabel}
                </Button>
              }
            />
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}
