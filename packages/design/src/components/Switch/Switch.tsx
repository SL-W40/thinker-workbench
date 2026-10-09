/**
 * 开关：布尔切换，`role="switch"`。
 */

export type SwitchProps = {
  /** 是否开启。 */
  checked: boolean;
  /** 状态变化回调。 */
  onChange: (checked: boolean) => void;
  /** 禁用。 */
  disabled?: boolean;
  /** 元素 id。 */
  id?: string;
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
};

export function Switch({
  checked,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      className={`tw-switch${className ? ` ${className}` : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="tw-switch__thumb" />
    </button>
  );
}
