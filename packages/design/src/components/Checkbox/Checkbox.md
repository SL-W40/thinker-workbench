# Checkbox

带可选标签的多选项（自定义 checkbox 按钮）。

## 导入

```ts
import { Checkbox } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Checkbox checked={on} onChange={setOn}>记住选择</Checkbox>
<Checkbox checked={on} onChange={setOn} aria-label="同意" />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | `boolean` | — | **必填** 是否勾选 |
| `onChange` | `(checked: boolean) => void` | — | **必填** 状态变化 |
| `disabled` | `boolean` | — | 禁用 |
| `id` | `string` | — | 按钮 id |
| `aria-label` | `string` | — | 无子标签时建议提供 |
| `children` | `ReactNode` | — | 旁侧标签 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Checkbox.less`。类名：`.tw-checkbox`。
