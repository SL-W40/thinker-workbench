# ContextMenu

Portal 上下文菜单：键盘 ↑↓ / Enter / Esc，点外侧关闭。

## 导入

```ts
import { ContextMenu } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<ContextMenu
  open={open}
  anchor={{ x, y }}
  onClose={() => setOpen(false)}
  items={[
    { label: "重命名", onSelect: rename },
    { label: "删除", danger: true, separatorBefore: true, onSelect: remove },
  ]}
/>
```

## API（菜单）

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | **必填** 是否打开 |
| `anchor` | `{ x, y }` \| `DOMRect` \| `null` | — | **必填** 锚点 |
| `onClose` | `() => void` | — | **必填** 关闭 |
| `items` | `ContextMenuItemProps[]` | — | **必填** 菜单项 |
| `aria-label` | `string` | — | 菜单无障碍名 |

## API（菜单项）

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | `string` | — | 标签 |
| `onSelect` | `() => void` | — | 选中回调 |
| `danger` | `boolean` | — | 危险样式 |
| `disabled` | `boolean` | — | 禁用 |
| `icon` | `ReactNode` | — | 左侧图标 |
| `separatorBefore` | `boolean` | — | 项前分隔线 |

## 样式

文件：`ContextMenu.less`。类名：`.tw-context-menu`。
