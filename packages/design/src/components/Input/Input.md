# Input

单行文本输入；默认关闭拼写红线与浏览器自动填充底色。

## 导入

```ts
import { Input } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Input value={v} onChange={(e) => setV(e.target.value)} placeholder="…" />
<Input invalid size="sm" startAdornment={<Search />} />
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | `sm` \| `md` \| `lg` | `md` | 视觉尺寸 |
| `invalid` | `boolean` | — | 错误描边（`aria-invalid`） |
| `startAdornment` | `ReactNode` | — | 前装饰 |
| `endAdornment` | `ReactNode` | — | 后装饰 |
| `spellCheck` | `boolean` | `false` | 拼写检查 |
| `autoComplete` | `string` | `off` | 自动填充 |
| `...rest` | `InputHTMLAttributes` | — | 透传原生 input（`size` 除外） |

## 样式

文件：`Input.less`。类名：`.tw-input`。
