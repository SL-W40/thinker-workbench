/**
 * 单选组：一组互斥选项。
 */
export type RadioOption = {
  /** 选项值。 */
  value: string;
  /** 可见标签。 */
  label: string;
  /** 单项禁用。 */
  disabled?: boolean;
};

export type RadioGroupProps = {
  /** 表单 name（写到 data-name，便于识别）。 */
  name: string;
  /** 当前选中值。 */
  value: string;
  /** 选项列表。 */
  options: RadioOption[];
  /** 选中变化回调。 */
  onChange: (value: string) => void;
  /** 整组禁用。 */
  disabled?: boolean;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 无障碍名称。 */
  "aria-label"?: string;
};

export function RadioGroup({
  name,
  value,
  options,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: RadioGroupProps) {
  return (
    <div
      className={`tw-radio-group${className ? ` ${className}` : ""}${disabled ? " is-disabled" : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const itemDisabled = disabled || opt.disabled;
        return (
          <label
            key={opt.value}
            className={`tw-radio${selected ? " is-selected" : ""}${itemDisabled ? " is-disabled" : ""}`}
          >
            <button
              type="button"
              className="tw-radio__dot"
              role="radio"
              aria-checked={selected}
              disabled={itemDisabled}
              data-name={name}
              onClick={() => !itemDisabled && onChange(opt.value)}
            >
              {selected ? <span className="tw-radio__fill" /> : null}
            </button>
            <span className="tw-radio__label">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
