/**
 * 可选选项卡（如主题选择器），`role="option"`。
 */
import type { ReactNode } from "react";

export type ChoiceCardProps = {
  /** 是否选中。 */
  selected: boolean;
  /** 选中回调。 */
  onSelect: () => void;
  /** 前置视觉（色块、图标等）。 */
  swatch?: ReactNode;
  /** 禁用。 */
  disabled?: boolean;
  /** 无障碍名称（子节点无文本时建议提供）。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
  children: ReactNode;
};

export function ChoiceCard({
  selected,
  onSelect,
  swatch,
  disabled,
  className,
  "aria-label": ariaLabel,
  children,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      className={["tw-choice-card", selected ? "is-selected" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => !disabled && onSelect()}
    >
      {swatch != null ? <span className="tw-choice-card__swatch">{swatch}</span> : null}
      <span className="tw-choice-card__body">{children}</span>
    </button>
  );
}
