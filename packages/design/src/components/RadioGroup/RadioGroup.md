# RadioGroup

互斥单选组。

## 导入

```ts
import { RadioGroup } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<RadioGroup
  name="plan"
  value={v}
  onChange={setV}
  options={[
    { value: "a", label: "选项 A" },
    { value: "b", label: "选项 B", disabled: true },
  ]}
/>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | — | **必填** 组名（data-name） |
| `value` | `string` | — | **必填** 当前值 |
| `options` | `RadioOption[]` | — | **必填** 选项 |
| `onChange` | `(value: string) => void` | — | **必填** |
| `disabled` | `boolean` | — | 整组禁用 |
| `aria-label` | `string` | — | 无障碍名称 |
| `className` | `string` | — | 追加 class |

## RadioOption

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `string` | — | 值 |
| `label` | `string` | — | 标签 |
| `disabled` | `boolean` | — | 单项禁用 |

## 样式

文件：`RadioGroup.less`。类名：`.tw-radio-group`、`.tw-radio`。
