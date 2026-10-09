/**
 * 多行文本框；默认关闭拼写检查与自动填充外观。
 */
import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** 视觉尺寸。默认 `md`。 */
  size?: "sm" | "md" | "lg";
  /** 无效 / 错误外观。 */
  invalid?: boolean;
};

/** 多行字段；默认关闭拼写检查 / 自动填充外观。 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    className,
    size = "md",
    invalid,
    disabled,
    spellCheck = false,
    autoComplete = "off",
    autoCorrect = "off",
    autoCapitalize = "off",
    rows = 3,
    ...rest
  },
  ref,
) {
  const cls = [
    "tw-textarea",
    `tw-textarea--${size}`,
    invalid ? "is-invalid" : "",
    disabled ? "is-disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <textarea
      ref={ref}
      className={cls}
      disabled={disabled}
      spellCheck={spellCheck}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      autoCapitalize={autoCapitalize}
      rows={rows}
      aria-invalid={invalid || undefined}
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      {...rest}
    />
  );
});
