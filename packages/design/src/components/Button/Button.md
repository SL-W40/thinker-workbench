# Button

带标签的操作按钮。`text` 为无边框文字链（如「试一下」）。

## 导入

```ts
import { Button } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Button variant="primary">保存</Button>
<Button variant="ghost" size="sm" startIcon={<PlusIcon />}>新建</Button>
<Button variant="text">试一下</Button>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `variant` | `primary` \| `secondary` \| `ghost` \| `text` \| `danger` | `secondary` | 视觉变体 |
| `size` | `sm` \| `md` \| `lg` | `md` | 尺寸 |
| `block` | `boolean` | `false` | 拉伸至容器宽度 |
| `startIcon` | `ReactNode` | — | 标签前图标 |
| `endIcon` | `ReactNode` | — | 标签后图标 |
| `disabled` | `boolean` | — | 禁用（原生） |
| `type` | `button` \| `submit` \| `reset` | `button` | 按钮类型 |
| `...rest` | `ButtonHTMLAttributes` | — | 透传原生 button 属性 |

## 样式

文件：`Button.less`。类名：`.tw-btn`、`.tw-btn--*`。
