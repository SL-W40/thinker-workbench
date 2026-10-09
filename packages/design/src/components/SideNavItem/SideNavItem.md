# SideNavItem

侧栏导航行：可选前置图标与选中态。

## 导入

```ts
import { SideNavItem } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<SideNavItem selected={nav === "general"} onClick={() => setNav("general")}>
  通用
</SideNavItem>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selected` | `boolean` | — | 选中（`aria-current="page"`） |
| `leading` | `ReactNode` | — | 前置图标 |
| `children` | `ReactNode` | — | 标签 |
| `disabled` | `boolean` | — | 禁用 |
| `onClick` | `MouseEventHandler` | — | 点击 |
| `...rest` | `ButtonHTMLAttributes` | — | 透传 button（除 type） |

## 样式

文件：`SideNavItem.less`。类名：`.tw-side-nav-item`。
