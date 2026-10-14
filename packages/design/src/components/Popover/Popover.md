# Popover

锚在触发器或坐标上的浮层。Portal 到 `document.body`，空间不够时翻到另一侧。

点外侧、Escape、地址 hash 变化，以及触发器所在页面被 `hidden` 时关闭。

## 导入

```ts
import { Popover } from "@thinker-workbench/design/react";
```

## 用法

```tsx
const anchorRef = useRef<HTMLButtonElement>(null);

<Button ref={anchorRef} onClick={() => setOpen(true)}>打开</Button>
<Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} role="dialog" aria-label="说明">
  <p>浮层内容</p>
</Popover>
```

`role="dialog"` 带表面样式。菜单请用 `Menu`，不要自己套一层边框。

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | **必填** |
| `onClose` | `() => void` | — | **必填** |
| `anchorRef` | `{ current: HTMLElement \| null }` | — | 触发器 |
| `anchor` | `{ x, y }` \| `DOMRect` \| `null` | — | 无 ref 时的锚点 |
| `placement` | `auto` \| `bottom` \| `top` | `auto` | 垂直方向 |
| `align` | `start` \| `center` \| `end` | `start` | 水平对齐 |
| `gap` | `number` | `4` | 与锚点的间距 |
| `matchAnchorWidth` | `boolean` | `false` | 至少与锚点同宽 |
| `role` | `dialog` \| `menu` \| `listbox` | — | 面板角色；`dialog` 带表面 |
| `aria-label` | `string` | — | 无障碍名称 |
| `closeOnOutside` | `boolean` | `true` | 点外侧关闭 |
| `closeOnEscape` | `boolean` | `true` | Escape 关闭 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Popover.less`。类名：`.tw-popover`、`.tw-popover--chrome`。
