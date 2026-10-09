/**
 * 进度条：确定进度或不确定动画。
 */

export type ProgressProps = {
  /** 确定模式下的当前值。默认 0。 */
  value?: number;
  /** 最大值。默认 100。 */
  max?: number;
  /** 不确定进度（忽略 value）。 */
  indeterminate?: boolean;
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
};

export function Progress({
  value = 0,
  max = 100,
  indeterminate,
  "aria-label": ariaLabel,
  className,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const pct = (clamped / safeMax) * 100;
  return (
    <div
      className={["tw-progress", indeterminate ? "is-indeterminate" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : safeMax}
      aria-valuenow={indeterminate ? undefined : clamped}
    >
      <div
        className="tw-progress__bar"
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
