/**
 * 空状态占位：可选图标 + 标题 + 可选说明与操作区。
 */
import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** 主标题。 */
  title: string;
  /** 补充说明。 */
  description?: string;
  /** 可选顶部图标 / 插画。 */
  icon?: ReactNode;
  /** 可选操作（如按钮）。 */
  action?: ReactNode;
  /** 追加到根节点的 class。 */
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={`tw-empty${className ? ` ${className}` : ""}`}>
      {icon != null ? <div className="tw-empty__icon">{icon}</div> : null}
      <strong className="tw-empty__title">{title}</strong>
      {description ? <p className="tw-empty__desc">{description}</p> : null}
      {action != null ? <div className="tw-empty__action">{action}</div> : null}
    </div>
  );
}
