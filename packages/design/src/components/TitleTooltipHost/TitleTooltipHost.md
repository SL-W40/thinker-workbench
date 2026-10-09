# TitleTooltipHost

为带原生 `title` 的元素提供统一悬浮提示（Portal）。通常由 `ThemeProvider` 自动挂载，应用侧无需手写。

## 导入

```ts
import { TitleTooltipHost } from "@thinker-workbench/design/react";
```

## API

无 props。监听文档内 `title` / 指针事件，在门户层渲染 `.tw-tooltip`。

## 样式

文件：`TitleTooltipHost.less`。类名：`.tw-tooltip`。
