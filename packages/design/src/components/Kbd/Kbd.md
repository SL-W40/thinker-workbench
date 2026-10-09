# Kbd

快捷键键帽；有 `onClick` 时渲染为按钮（可录制高亮）。

## 导入

```ts
import { Kbd } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Kbd>Ctrl+R</Kbd>
<Kbd recording onClick={startCapture} aria-label="录制快捷键">按下组合键…</Kbd>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 键位文案 |
| `recording` | `boolean` | — | 录制高亮 |
| `onClick` | `MouseEventHandler` | — | 有则渲染为 button |
| `disabled` | `boolean` | — | 仅按钮形态 |
| `aria-label` | `string` | — | 仅按钮形态 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Kbd.less`。类名：`.tw-kbd`、`.is-recording`。
