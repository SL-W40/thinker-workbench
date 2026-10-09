/**
 * 小型状态徽章（neutral / accent / danger / success）。
 */
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "neutral" | "accent" | "danger" | "success";

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** 视觉变体。默认 `neutral`。 */
  variant?: BadgeVariant;
  children: ReactNode;
};

export function Badge({ variant = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={`tw-badge tw-badge--${variant}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </span>
  );
}
