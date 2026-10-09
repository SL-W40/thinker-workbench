# Badge

小号状态标签，用于状态、分类或轻量标注。

## 导入

```ts
import { Badge } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Badge>中性</Badge>
<Badge variant="accent">强调</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="danger">危险</Badge>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `neutral` \| `accent` \| `success` \| `danger` | `neutral` | 视觉变体 |
| `children` | `ReactNode` | — | 标签内容 |
| `className` | `string` | — | 追加 class |
| `...rest` | `HTMLAttributes<span>` | — | 透传原生 span 属性（如 `title`） |

## 样式

文件：`Badge.less`。类名：`.tw-badge`、`.tw-badge--*`。
