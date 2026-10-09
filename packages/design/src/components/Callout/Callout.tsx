/**
 * 行内提示 / 警告 / 危险说明块。
 */
import type { HTMLAttributes, ReactNode } from "react";

export type CalloutTone = "info" | "warning" | "danger";

export type CalloutProps = Omit<HTMLAttributes<HTMLElement>, "title" | "children"> & {
  /** 语气。默认 `info`。 */
  tone?: CalloutTone;
  /** 可选标题。 */
  title?: ReactNode;
  /** 右侧操作区（如按钮）。 */
  action?: ReactNode;
  children: ReactNode;
};

export function Callout({
  tone = "info",
  title,
  action,
  className,
  children,
  role = "note",
  ...rest
}: CalloutProps) {
  return (
    <aside
      className={`tw-callout tw-callout--${tone}${className ? ` ${className}` : ""}`}
      role={role}
      {...rest}
    >
      {title != null ? <strong className="tw-callout__title">{title}</strong> : null}
      <div className={`tw-callout__body${action != null ? " has-action" : ""}`}>
        <div className="tw-callout__content">{children}</div>
        {action != null ? <div className="tw-callout__action">{action}</div> : null}
      </div>
    </aside>
  );
}
