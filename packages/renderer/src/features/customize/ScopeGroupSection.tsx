/**
 * Customize 内按作用域展开的分组：标题栏 + 添加 + 空状态 / 内容。
 */
import { Button, Disclosure, EmptyState } from "@thinker-workbench/design/react";
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
    <Disclosure
      title={title}
      count={count}
      open={open}
      onOpenChange={setOpen}
      actions={
        <>
          {headerExtra}
          <Button size="sm" variant="primary" onClick={onAdd}>
            {addLabel}
          </Button>
        </>
      }
    >
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
    </Disclosure>
  );
}
