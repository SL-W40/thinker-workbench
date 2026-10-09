# Icon

统一 SVG 图标体系：全部 16×16、1.5 描边线形。每个图标是独立具名组件（如 `ChevronLeftIcon`）。

## 导入

```ts
import {
  ChevronLeftIcon,
  PlusIcon,
  SettingsIcon,
  listDesignIcons,
} from "@thinker-workbench/design/react";
```

## 用法

```tsx
<IconButton aria-label="返回"><ChevronLeftIcon /></IconButton>
<SettingsIcon active size="md" />
<ChevronRightIcon open={expanded} size="sm" />
```

## 基座 API（IconProps）

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | `sm` \| `md` \| `lg` \| `inherit` | `inherit` | 14 / 16 / 20 / `1em` |
| `decorative` | `boolean` | `true` | `aria-hidden`；有 `title` 时视为有意义 |
| `title` | `string` | — | 读屏标题 |
| `className` | `string` | — | 追加到 `.tw-icon` |
| `open` | `boolean` | — | 仅部分图标（如 `ChevronRightIcon`） |
| `active` | `boolean` | — | 仅 `SettingsIcon` / `ConsoleIcon` |

## 具名图标

见 `listDesignIcons()` 或 Components 页画廊。含导航、窗口、侧栏、文件、播放控制等。新增：在 `icons.tsx` 用 `createIcon` 或手写，并登记 `catalog.ts`。

## 样式约定

文件：`Icon.less`。统一 `viewBox="0 0 16 16"`、内容约落在 3–13 光学框（四周约 3px 留白）、`stroke-width: 1.5`、圆角端点。实心块用 `.tw-icon__fill`（侧栏激活等）。
