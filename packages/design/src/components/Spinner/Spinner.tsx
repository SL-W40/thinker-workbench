/**
 * 加载转圈；可声明为装饰性（由父级已暴露 busy）。
 */
export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = {
  /** 尺寸。默认 `md`。 */
  size?: SpinnerSize;
  /** 无障碍标签；默认 “Loading”。`decorative` 时忽略。 */
  label?: string;
  /** 从无障碍树隐藏（父级已暴露 busy 状态）。 */
  decorative?: boolean;
  /** 追加到根节点的 class。 */
  className?: string;
};

const SIZE_PX = { sm: 16, md: 22, lg: 28 } as const;

export function Spinner({ size = "md", label = "Loading", decorative, className }: SpinnerProps) {
  const px = SIZE_PX[size];
  return (
    <span
      className={`tw-spinner tw-spinner--${size}${className ? ` ${className}` : ""}`}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-busy={decorative ? undefined : true}
      aria-hidden={decorative || undefined}
    >
      <svg viewBox="0 0 28 28" width={px} height={px} aria-hidden>
        <circle
          className="tw-spinner__track"
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          className="tw-spinner__arc"
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="20 56"
        />
      </svg>
    </span>
  );
}
