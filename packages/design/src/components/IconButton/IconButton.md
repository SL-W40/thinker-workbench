# IconButton

纯图标操作按钮；必须提供 `aria-label`。

## 导入

```ts
import { IconButton, ChevronLeftIcon } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<IconButton aria-label="返回" title="返回">
  <ChevronLeftIcon />
</IconButton>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `aria-label` | `string` | — | **必填** 无障碍名称 |
| `variant` | `ghost` \| `secondary` | `ghost` | 视觉变体 |
| `size` | `sm` \| `md` \| `lg` | `md` | 尺寸 |
| `children` | `ReactNode` | — | 图标（建议用具名 `*Icon`） |
| `disabled` | `boolean` | — | 禁用 |
| `...rest` | `ButtonHTMLAttributes` | — | 透传原生 button |

## 样式

文件：`IconButton.less`。类名：`.tw-icon-btn`。子 SVG 默认 `1em`。
