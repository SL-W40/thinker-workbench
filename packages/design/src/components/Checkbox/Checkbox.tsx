/**
 * 勾选框：按钮式 checkbox 外壳 + 可选标签。
 */
import type { ReactNode } from "react";

export type CheckboxProps = {
  /** 是否勾选。 */
  checked: boolean;
  /** 勾选状态变化回调。 */
  onChange: (checked: boolean) => void;
  /** 禁用。 */
  disabled?: boolean;
  /** 关联 id（写到按钮，便于 label/htmlFor）。 */
  id?: string;
  /** 无障碍名称（无子标签时建议提供）。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 旁侧文字标签。 */
  children?: ReactNode;
};

export function Checkbox({
  checked,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  children,
}: CheckboxProps) {
  return (
    <label
      className={`tw-checkbox${className ? ` ${className}` : ""}${disabled ? " is-disabled" : ""}`}
    >
      <button
        type="button"
        id={id}
        className="tw-checkbox__box"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
      >
        {checked ? (
          <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden>
            <path
              d="M2.5 6.2L5 8.7 9.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>
      {children != null ? <span className="tw-checkbox__label">{children}</span> : null}
    </label>
  );
}
