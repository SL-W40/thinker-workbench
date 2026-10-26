# Slider

滑块：连续 / 步进数值选择。原生 `input[type=range]` 保证键盘（←→ Home End）与读屏语义，外观自绘。

## 导入

```ts
import { Slider } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Slider
  value={scale}
  onChange={setScale}
  min={0.8}
  max={1.25}
  step={0.05}
  ticks={10}
  valueText={`${Math.round(scale * 100)}%`}
  aria-label="界面字体大小"
/>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `number` | — | **必填**，受控值 |
| `onChange` | `(value: number) => void` | — | **必填**，拖动过程中连续触发 |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步进 |
| `size` | `"sm" \| "md"` | `md` | 轨道 / 拇指尺寸 |
| `ticks` | `number` | — | 轨道下方刻度点数量，不传则不画 |
| `valueText` | `ReactNode` | — | 右侧数值展示（如 `110%`） |
| `disabled` | `boolean` | — | 禁用 |
| `className` | `string` | — | 追加 class |

其余原生属性（`id`、`aria-label`、`onPointerUp` 等）透传到内部 `input`。

## 样式

文件：`Slider.less`。类名：`.tw-slider`，已选进度由 `--tw-slider-progress`（0–1）驱动。
