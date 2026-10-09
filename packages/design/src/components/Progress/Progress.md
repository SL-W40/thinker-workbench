# Progress

确定进度条或不确定动画。

## 导入

```ts
import { Progress } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Progress value={42} aria-label="进度" />
<Progress value={3} max={10} />
<Progress indeterminate aria-label="加载中" />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `number` | `0` | 当前值 |
| `max` | `number` | `100` | 最大值 |
| `indeterminate` | `boolean` | — | 不确定动画（忽略 value） |
| `aria-label` | `string` | — | 无障碍名称 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Progress.less`。类名：`.tw-progress`。
