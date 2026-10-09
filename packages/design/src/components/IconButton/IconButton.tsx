/**
 * 仅图标按钮；必须提供 `aria-label`。
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type IconButtonVariant = "ghost" | "secondary";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** 无障碍名称——仅图标控件必填。 */
  "aria-label": string;
  /** 视觉变体。默认 `ghost`。 */
  variant?: IconButtonVariant;
  /** 尺寸。默认 `md`。 */
  size?: IconButtonSize;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = "ghost", size = "md", type = "button", disabled, children, ...rest },
  ref,
) {
  const cls = ["tw-icon-btn", `tw-icon-btn--${variant}`, `tw-icon-btn--${size}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
});
