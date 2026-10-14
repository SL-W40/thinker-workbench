# Chip

可移除的小标签。只展示时不传 `onRemove`。

## 导入

```ts
import { Chip } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Chip tone="accent" removeLabel="移除 rg" onRemove={() => remove("rg")}>
  <code>rg</code>
</Chip>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 标签内容 |
| `tone` | `neutral` \| `accent` \| `danger` \| `success` | `neutral` | 色调 |
| `onRemove` | `() => void` | — | 移除回调 |
| `removeLabel` | `string` | — | 移除按钮的无障碍名称 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Chip.less`。类名：`.tw-chip`。
