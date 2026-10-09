# Spinner

行内加载指示。

## 导入

```ts
import { Spinner } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Spinner label="加载中" />
<Spinner size="sm" decorative />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | `sm` \| `md` \| `lg` | `md` | 尺寸 |
| `label` | `string` | `Loading` | 无障碍文案 |
| `decorative` | `boolean` | — | 隐藏于无障碍树 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Spinner.less`。类名：`.tw-spinner`。
