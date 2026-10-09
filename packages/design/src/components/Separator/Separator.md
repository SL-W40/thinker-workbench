# Separator

分隔线；默认装饰性（`aria-hidden`）。

## 导入

```ts
import { Separator } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Separator />
<Separator orientation="vertical" />
<Separator decorative={false} />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `orientation` | `horizontal` \| `vertical` | `horizontal` | 方向 |
| `decorative` | `boolean` | `true` | `false` 时对读屏暴露 separator |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Separator.less`。类名：`.tw-separator`。
