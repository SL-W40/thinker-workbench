# SegmentedControl

紧凑的二到三选一分段控件。

## 导入

```ts
import { SegmentedControl } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<SegmentedControl
  value={mode}
  onChange={setMode}
  aria-label="模式"
  options={[
    { value: "one", label: "选项一" },
    { value: "two", label: "选项二" },
  ]}
/>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `string` | — | **必填** |
| `options` | `SegmentedOption[]` | — | **必填** |
| `onChange` | `(value: string) => void` | — | **必填** |
| `disabled` | `boolean` | — | 整组禁用 |
| `aria-label` | `string` | — | 无障碍名称 |
| `className` | `string` | — | 追加 class |

## SegmentedOption

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `string` | — | 值 |
| `label` | `string` | — | 标签 |
| `disabled` | `boolean` | — | 单项禁用 |

## 样式

文件：`SegmentedControl.less`。类名：`.tw-segmented`。
