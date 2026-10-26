/**
 * 滑块：连续 / 步进数值选择（原生 `input[type=range]` 的自绘壳）。
 *
 * 用原生 range 保证键盘（←→ Home End）、拖动与读屏语义都由浏览器兜底，
 * 外观全部自绘：轨道进度用 `--tw-slider-progress`（0–1）驱动，
 * 可选刻度点与右侧数值输出。
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type SliderProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "size" | "onChange"
> & {
  /** 当前值（受控）。 */
  value: number;
  /** 值变化回调。拖动过程中会连续触发。 */
  onChange: (value: number) => void;
  /** 最小值。默认 `0`。 */
  min?: number;
  /** 最大值。默认 `100`。 */
  max?: number;
  /** 步进；`number` 步长或 `"any"` 连续。默认 `1`。 */
  step?: number;
  /** 视觉尺寸。默认 `md`。 */
  size?: "sm" | "md";
  /** 轨道下方的刻度点数量（不传则不画刻度）。 */
  ticks?: number;
  /** 右侧数值展示（如 `110%`）；不传则不显示。 */
  valueText?: ReactNode;
  /** 追加到根节点的 class。 */
  className?: string;
};

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    className,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    size = "md",
    ticks,
    valueText,
    disabled,
    style,
    ...rest
  },
  ref,
) {
  const span = max - min;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  /** 相邻刻度点的间距（占轨道宽度比例）；n 个点把它分成 n-1 段。 */
  const tickStep = ticks && ticks > 1 ? 1 / (ticks - 1) : 0;
  const rootClass = [
    "tw-slider",
    `tw-slider--${size}`,
    ticks ? "has-ticks" : "",
    disabled ? "is-disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={rootClass}
      style={{
        ...style,
        ["--tw-slider-progress" as string]: ratio,
        ...(tickStep ? { ["--tw-slider-tick-step" as string]: tickStep } : null),
      }}
    >
      <input
        ref={ref}
        type="range"
        className="tw-slider__control"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        {...rest}
      />
      {ticks && ticks > 1 ? <span className="tw-slider__ticks" aria-hidden /> : null}
      {valueText != null ? <output className="tw-slider__value">{valueText}</output> : null}
    </span>
  );
});
