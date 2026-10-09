/**
 * 图标基座：统一尺寸 / 描边 / 装饰性无障碍，供各具名 `*Icon` 组合使用。
 */
import {
  forwardRef,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";

export type IconSize = "sm" | "md" | "lg" | "inherit";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox"> & {
  /** 尺寸。默认 `inherit`（跟随字号 / IconButton 的 1em）。 */
  size?: IconSize;
  /**
   * 装饰性图标（默认 true）：`aria-hidden`。
   * 若提供 `title` 则视为有意义图标并暴露给读屏。
   */
  decorative?: boolean;
  /** 可选可读标题（有则关闭 decorative）。 */
  title?: string;
};

const SIZE_PX: Record<Exclude<IconSize, "inherit">, number> = {
  sm: 14,
  md: 16,
  lg: 20,
};

type IconRootProps = IconProps & {
  viewBox?: string;
  children: ReactNode;
  /** 写入 data-icon，便于调试与样式钩子。 */
  name: string;
};

/** 底层 SVG 壳；应用侧一般用具名 `*Icon`，不必直接调用。 */
export const Icon = forwardRef<SVGSVGElement, IconRootProps>(function Icon(
  {
    name,
    size = "inherit",
    decorative = true,
    title,
    className,
    viewBox = "0 0 16 16",
    children,
    ...rest
  },
  ref,
) {
  const meaningful = Boolean(title) || decorative === false;
  const dim = size === "inherit" ? undefined : SIZE_PX[size];
  const cls = ["tw-icon", `tw-icon--${size}`, className ?? ""].filter(Boolean).join(" ");

  return (
    <svg
      ref={ref}
      className={cls}
      viewBox={viewBox}
      width={dim}
      height={dim}
      fill="none"
      data-icon={name}
      aria-hidden={meaningful ? undefined : true}
      role={meaningful ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
});

/** 由路径节点生成无额外 props 的具名图标组件。 */
export function createIcon(
  name: string,
  children: ReactNode,
  viewBox = "0 0 16 16",
): ComponentType<IconProps> {
  function NamedIcon(props: IconProps) {
    return (
      <Icon name={name} viewBox={viewBox} {...props}>
        {children}
      </Icon>
    );
  }
  NamedIcon.displayName = name;
  return NamedIcon;
}
