/**
 * 设置行：左侧标题和说明，右侧控件。stack 时控件落到标题下方。
 */
import type { ReactNode } from "react";

export type SettingsRowProps = {
  /** 标题。 */
  title: ReactNode;
  /** 说明。 */
  description?: ReactNode;
  /** 右侧或下方的控件。 */
  children?: ReactNode;
  /** 控件换到标题下方。 */
  stack?: boolean;
  /** 传给标题 label 的 htmlFor。 */
  htmlFor?: string;
  /** 追加 class。 */
  className?: string;
};

export function SettingsRow({
  title,
  description,
  children,
  stack,
  htmlFor,
  className,
}: SettingsRowProps) {
  const cls = ["tw-settings-row", stack ? "tw-settings-row--stack" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="tw-settings-row__copy">
        {htmlFor ? (
          <label className="tw-settings-row__title" htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <strong className="tw-settings-row__title">{title}</strong>
        )}
        {description != null ? <p className="tw-settings-row__desc">{description}</p> : null}
      </div>
      {children != null ? <div className="tw-settings-row__control">{children}</div> : null}
    </div>
  );
}
