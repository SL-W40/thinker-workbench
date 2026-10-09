# Select

单选列表；菜单 Portal 到 `document.body`，自动上下定位。

## 导入

```ts
import { Select } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Select
  id="locale"
  value={locale}
  onChange={setLocale}
  aria-label="语言"
  options={[
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
  ]}
/>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `T` | — | **必填** 当前值 |
| `options` | `SelectOption<T>[]` | — | **必填** |
| `onChange` | `(value: T) => void` | — | **必填** |
| `id` | `string` | — | 触发器 id |
| `disabled` | `boolean` | — | 禁用 |
| `aria-label` | `string` | — | 无障碍名称 |
| `className` | `string` | — | 追加 class |

## SelectOption

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `T` | — | 值 |
| `label` | `string` | — | 可见标签 |

## 样式

文件：`Select.less`。类名：`.tw-select`。
