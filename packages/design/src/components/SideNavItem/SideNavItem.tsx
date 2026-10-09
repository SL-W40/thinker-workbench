/**
 * 侧栏导航行：可选前置图标与选中态。
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SideNavItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  /** 是否当前页 / 选中。 */
  selected?: boolean;
  /** 前置图标或装饰。 */
  leading?: ReactNode;
  children: ReactNode;
};

export function SideNavItem({
  selected,
  onClick,
  disabled,
  className,
  leading,
  children,
  ...rest
}: SideNavItemProps) {
  return (
    <button
      type="button"
      className={["tw-side-nav-item", selected ? "is-selected" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      aria-current={selected ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {leading != null ? <span className="tw-side-nav-item__leading">{leading}</span> : null}
      <span className="tw-side-nav-item__label">{children}</span>
    </button>
  );
}
