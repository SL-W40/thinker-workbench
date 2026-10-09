# TextArea

多行输入；默认关闭拼写检查与自动填充底色。

## 导入

```ts
import { TextArea } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<TextArea value={v} onChange={(e) => setV(e.target.value)} rows={4} />
<TextArea invalid size="sm" />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | `sm` \| `md` \| `lg` | `md` | 视觉尺寸 |
| `invalid` | `boolean` | — | 错误描边 |
| `rows` | `number` | `3` | 行数 |
| `spellCheck` | `boolean` | `false` | 拼写检查 |
| `...rest` | `TextareaHTMLAttributes` | — | 透传原生 textarea |

## 样式

文件：`TextArea.less`。类名：`.tw-textarea`。
