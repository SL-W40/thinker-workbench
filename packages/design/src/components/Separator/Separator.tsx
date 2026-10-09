/**
 * 分隔线；默认装饰性（从无障碍树隐藏）。
 */

export type SeparatorProps = {
  /** 方向。默认 `horizontal`。 */
  orientation?: "horizontal" | "vertical";
  /**
   * 装饰性（默认 true）：`aria-hidden`。
   * 设为 false 时作为真正的 separator 暴露给读屏。
   */
  decorative?: boolean;
  /** 追加到根节点的 class。 */
  className?: string;
};

export function Separator({
  orientation = "horizontal",
  decorative = true,
  className,
}: SeparatorProps) {
  return (
    <div
      className={`tw-separator tw-separator--${orientation}${className ? ` ${className}` : ""}`}
      role="separator"
      aria-orientation={orientation}
      aria-hidden={decorative || undefined}
    />
  );
}
