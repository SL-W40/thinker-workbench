/**
 * 可移除的小标签。无 onRemove 时只展示。
 */
import type { ReactNode } from "react";
import { CloseIcon } from "../Icon";
import { IconButton } from "../IconButton/IconButton";

export type ChipTone = "neutral" | "accent" | "danger" | "success";

export type ChipProps = {
  children: ReactNode;
  /** 色调。默认 neutral。 */
  tone?: ChipTone;
  /** 追加 class。 */
  className?: string;
} & (
  | {
      /** 只展示，不提供移除。 */
      onRemove?: undefined;
      removeLabel?: undefined;
    }
  | {
      /** 移除回调。 */
      onRemove: () => void;
      /** 移除按钮的无障碍名称。 */
      removeLabel: string;
    }
);

export function Chip({ children, tone = "neutral", className, onRemove, removeLabel }: ChipProps) {
  return (
    <span className={`tw-chip tw-chip--${tone}${className ? ` ${className}` : ""}`}>
      <span className="tw-chip__label">{children}</span>
      {onRemove ? (
        <IconButton
          size="sm"
          variant="ghost"
          className="tw-chip__remove"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <CloseIcon />
        </IconButton>
      ) : null}
    </span>
  );
}
