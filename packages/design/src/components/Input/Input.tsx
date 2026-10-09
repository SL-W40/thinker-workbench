/**
 * 单行文本框；默认关闭拼写检查与浏览器自动填充外观
 * （无红色波浪线 / 黄色自动填充底）。
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** 视觉尺寸。默认 `md`。 */
  size?: "sm" | "md" | "lg";
  /** 无效 / 错误外观。 */
  invalid?: boolean;
  /** 字段内可选前置装饰。 */
  startAdornment?: ReactNode;
  /** 字段内可选后置装饰。 */
  endAdornment?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    size = "md",
    invalid,
    disabled,
    spellCheck = false,
    autoComplete = "off",
    autoCorrect = "off",
    autoCapitalize = "off",
    startAdornment,
    endAdornment,
    ...rest
  },
  ref,
) {
  const shellClass = [
    "tw-input",
    `tw-input--${size}`,
    invalid ? "is-invalid" : "",
    disabled ? "is-disabled" : "",
    startAdornment ? "has-start" : "",
    endAdornment ? "has-end" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={shellClass}>
      {startAdornment ? (
        <span className="tw-input__adornment tw-input__adornment--start">{startAdornment}</span>
      ) : null}
      <input
        ref={ref}
        className="tw-input__control"
        disabled={disabled}
        spellCheck={spellCheck}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        aria-invalid={invalid || undefined}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        {...rest}
      />
      {endAdornment ? (
        <span className="tw-input__adornment tw-input__adornment--end">{endAdornment}</span>
      ) : null}
    </span>
  );
});
