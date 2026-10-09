# Masonry

按最短列排布的瀑布流；绝对定位 + ResizeObserver。

## 导入

```ts
import { Masonry } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Masonry gap={16} columns={3}>
  {items.map((it) => <Card key={it.id}>{it}</Card>)}
</Masonry>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 子项 |
| `gap` | `number` | `16` | 列间距 px |
| `columns` | `number` | `3` | 最宽时列数 |
| `breakpoints` | `MasonryBreakpoint[]` | 默认 ≤700→1、≤1100→2 | 响应式断点；`[]` 固定 `columns` |
| `className` | `string` | — | 追加 class |

## MasonryBreakpoint

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `maxWidth` | `number` | — | 容器宽度上限（含） |
| `columns` | `number` | — | 该宽度下列数 |

## 样式

文件：`Masonry.less`。类名：`.tw-masonry`。
