/**
 * 表单字段外壳：标签 + 可选说明 / 错误，包裹控件。
 */
import type { ReactNode } from "react";

export type FieldProps = {
  /** 字段标签。 */
  label?: ReactNode;
  /** 辅助说明。 */
  description?: ReactNode;
  /** 错误文案。 */
  error?: ReactNode;
  /** 必填标记（标签旁显示 *，并设置 aria-required 提示语义由控件自行承担）。 */
  required?: boolean;
  /** 关联控件的 `id`（传给 label 的 htmlFor）。 */
  htmlFor?: string;
  /** 追加到根节点的 class。 */
  className?: string;
  children: ReactNode;
};

/** 标签 + 可选说明 / 错误，包裹一个控件。 */
export function Field({
  label,
  description,
  error,
  required,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div
      className={`tw-field${className ? ` ${className}` : ""}${required ? " is-required" : ""}`}
    >
      {label != null ? (
        <label className="tw-field__label" htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="tw-field__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {description != null ? <p className="tw-field__desc">{description}</p> : null}
      <div className="tw-field__control">{children}</div>
      {error != null ? <p className="tw-field__error">{error}</p> : null}
    </div>
  );
}
