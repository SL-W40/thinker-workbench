# Switch

设置行用的布尔开关（`role="switch"`）。

## 导入

```ts
import { Switch } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Switch checked={on} onChange={setOn} aria-label="系统通知" />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | `boolean` | — | **必填** |
| `onChange` | `(checked: boolean) => void` | — | **必填** |
| `disabled` | `boolean` | — | 禁用 |
| `id` | `string` | — | 元素 id |
| `aria-label` | `string` | — | 无障碍名称 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Switch.less`。类名：`.tw-switch`。
