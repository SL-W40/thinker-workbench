# Menu

锚定在触发器上的菜单。支持分组、说明、勾选、快捷键和子菜单。触发器由调用方自己画。

## 导入

```ts
import { Menu } from "@thinker-workbench/design/react";
```

## 用法

```tsx
const anchorRef = useRef<HTMLButtonElement>(null);

<Button ref={anchorRef} onClick={() => setOpen((v) => !v)}>操作</Button>
<Menu
  open={open}
  anchorRef={anchorRef}
  onClose={() => setOpen(false)}
  aria-label="操作"
  groups={[
    {
      label: "文件",
      items: [
        { label: "重命名", shortcut: "F2", onSelect: rename },
        { label: "置顶", checked: pinned, onSelect: togglePin },
      ],
    },
  ]}
/>
```

右键坐标菜单用 `ContextMenu`（同一套条目）。

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | **必填** |
| `onClose` | `() => void` | — | **必填** |
| `anchorRef` | `{ current: HTMLElement \| null }` | — | 触发器 |
| `anchor` | `{ x, y }` \| `DOMRect` \| `null` | — | 无 ref 时的锚点 |
| `items` | `MenuItem[]` | — | 扁平条目；有则忽略 `groups` |
| `groups` | `MenuGroup[]` | — | 分组条目 |
| `align` | `start` \| `center` \| `end` | `start` | 水平对齐 |
| `aria-label` | `string` | — | 菜单无障碍名 |
| `className` | `string` | — | 追加到浮层 |

## MenuItem

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `label` | `string` | 标签 |
| `onSelect` | `() => void` | 选中回调 |
| `description` | `string` | 标签下说明 |
| `shortcut` | `string` | 右侧快捷键 |
| `checked` | `boolean` | 勾选 |
| `danger` | `boolean` | 危险样式 |
| `disabled` | `boolean` | 禁用 |
| `icon` | `ReactNode` | 左侧图标 |
| `separatorBefore` | `boolean` | 项前分隔线 |
| `items` | `MenuItem[]` | 子菜单 |

## 样式

文件：`Menu.less`。类名：`.tw-menu`。
