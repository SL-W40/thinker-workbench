/**
 * 快捷键键帽；设置 `onClick` 时渲染为按钮。
 * 字符串子节点会按键位拆开，修饰符符号单独放大以对齐视觉字号。
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type KbdProps = {
  children: ReactNode;
  /** 高亮录制 / 捕获状态。 */
  recording?: boolean;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 有点击时以按钮呈现。 */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  /** 禁用（仅按钮形态）。 */
  disabled?: boolean;
  /** 无障碍名称（仅按钮形态）。 */
  "aria-label"?: string;
};

/** macOS 修饰符 / 方向等单字符符号（字面量易比拉丁字母偏小）。 */
const GLYPH_SYM = /^[⌘⌥⌃⇧←→↑↓⏎⌫]$/;

/** 将快捷键文案拆成等视觉高度的键位片段。 */
function renderLabel(label: string): ReactNode {
  const hasMacGlyphs = /[⌘⌥⌃⇧←→↑↓]/.test(label);
  // mac：无分隔符连写（⌘⌥B）；其它：Ctrl+R / Esc 等
  const parts = hasMacGlyphs
    ? Array.from(label)
    : label.includes("+")
      ? label.split("+").filter(Boolean)
      : [label];

  // 单段且无符号时不必包一层（录制提示等）
  if (parts.length === 1 && !hasMacGlyphs) return label;

  return parts.map((part, i) => {
    const isSym = part.length === 1 && GLYPH_SYM.test(part);
    return (
      <span
        key={`${part}-${i}`}
        className={isSym ? "tw-kbd__glyph tw-kbd__glyph--sym" : "tw-kbd__glyph"}
      >
        {part}
      </span>
    );
  });
}

/** 键帽外壳；有 `onClick` 时渲染为按钮。 */
export function Kbd({
  children,
  recording,
  className,
  onClick,
  disabled,
  "aria-label": ariaLabel,
}: KbdProps) {
  const cls = ["tw-kbd", recording ? "is-recording" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  const content = typeof children === "string" ? renderLabel(children) : children;

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <kbd className={cls}>{content}</kbd>;
}
