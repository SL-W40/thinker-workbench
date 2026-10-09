/**
 * 带标签的操作按钮（primary / secondary / ghost / text / danger）。
 * `text` 为无边框文字链样式（如「试一下」）。
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

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
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={cls} disabled={disabled} {...rest}>
      {startIcon ? <span className="tw-btn__icon">{startIcon}</span> : null}
      {children != null ? <span className="tw-btn__label">{children}</span> : null}
      {endIcon ? <span className="tw-btn__icon">{endIcon}</span> : null}
    </button>
  );
});
