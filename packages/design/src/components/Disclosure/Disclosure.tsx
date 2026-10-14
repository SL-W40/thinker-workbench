/**
 * 可折叠分组：标题、可选计数、右侧操作，展开后显示内容。
 */
import type { ReactNode } from "react";
import { ChevronRightIcon } from "../Icon";

export type DisclosureProps = {
  /** 标题。 */
  title: ReactNode;
  /** 标题旁的数量。 */
  count?: number;
  /** 是否展开。 */
  open: boolean;
  /** 展开变化。 */
  onOpenChange: (open: boolean) => void;
  /** 标题行右侧操作，点击不会触发展开。 */
  actions?: ReactNode;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 追加到内容区的 class。 */
  panelClassName?: string;
  children?: ReactNode;
};

export function Disclosure({
  title,
  count,
  open,
  onOpenChange,
  actions,
  className,
  panelClassName,
  children,
}: DisclosureProps) {
  const root = ["tw-disclosure", open ? "is-open" : "", className ?? ""].filter(Boolean).join(" ");
  const panel = ["tw-disclosure__panel", panelClassName ?? ""].filter(Boolean).join(" ");

  return (
    <section className={root}>
      <div className="tw-disclosure__head">
        <button
          type="button"
          className="tw-disclosure__toggle"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <ChevronRightIcon open={open} size="sm" />
          <span className="tw-disclosure__title">{title}</span>
          {count != null ? <span className="tw-disclosure__count">{count}</span> : null}
        </button>
        {actions ? <div className="tw-disclosure__actions">{actions}</div> : null}
      </div>
      {open ? <div className={panel}>{children}</div> : null}
    </section>
  );
}
