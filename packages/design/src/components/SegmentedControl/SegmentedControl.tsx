/**
 * 紧凑分段控件：2–3 项单选切换。
 */
export type SegmentedOption = {
  /** 选项值。 */
  value: string;
  /** 可见标签。 */
  label: string;
  /** 单项禁用。 */
  disabled?: boolean;
};

export type SegmentedControlProps = {
  /** 当前选中值。 */
  value: string;
  /** 分段选项。 */
  options: SegmentedOption[];
  /** 选中变化回调。 */
  onChange: (value: string) => void;
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 整组禁用。 */
  disabled?: boolean;
};

export function SegmentedControl({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  className,
  disabled,
}: SegmentedControlProps) {
  return (
    <div
      className={`tw-segmented${className ? ` ${className}` : ""}${disabled ? " is-disabled" : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const itemDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={itemDisabled}
            className={`tw-segmented__item${selected ? " is-selected" : ""}`}
            onClick={() => !itemDisabled && onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
