/**
 * 带标签的操作按钮（primary / secondary / ghost / text / danger）。
 * `text` 为无边框文字链样式（如「试一下」）。
 */
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { Spinner } from "../Spinner/Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "text" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 视觉变体。默认 `secondary`。`text` 为内联文字按钮。 */
  variant?: ButtonVariant;
  /** 尺寸。默认 `md`。 */
  size?: ButtonSize;
  /** 拉伸至容器宽度。 */
  block?: boolean;
  /** 标签前图标。 */
  startIcon?: ReactNode;
  /** 标签后图标。 */
  endIcon?: ReactNode;
  /** 忙碌：禁用点击，标签前显示转圈。 */
  busy?: boolean;
  /** 无可见文案时，给读屏的忙碌说明。 */
  busyLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "secondary",
    size = "md",
    block,
    type = "button",
    disabled,
    startIcon,
    endIcon,
    busy,
    busyLabel,
    children,
    ...rest
  },
  ref,
) {
  const cls = [
    "tw-btn",
    `tw-btn--${variant}`,
    `tw-btn--${size}`,
    block ? "tw-btn--block" : "",
    busy ? "is-busy" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const showBusyText = Boolean(busy && busyLabel && (children == null || children === ""));

  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <span className="tw-btn__icon">
          <Spinner size={size === "lg" ? "md" : "sm"} decorative />
        </span>
      ) : startIcon ? (
        <span className="tw-btn__icon">{startIcon}</span>
      ) : null}
      {children != null && children !== "" ? (
        <span className="tw-btn__label">{children}</span>
      ) : null}
      {showBusyText ? <span className="tw-btn__busy-label">{busyLabel}</span> : null}
      {endIcon ? <span className="tw-btn__icon">{endIcon}</span> : null}
    </button>
  );
});
