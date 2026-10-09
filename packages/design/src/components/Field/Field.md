# Field

表单字段外壳：标签、说明、错误，包裹任意控件。

## 导入

```ts
import { Field, Input } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Field label="备注" htmlFor="notes" required description="可选" error={err}>
  <Input id="notes" value={v} onChange={...} />
</Field>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` | `ReactNode` | — | 标签 |
| `description` | `ReactNode` | — | 辅助说明 |
| `error` | `ReactNode` | — | 错误文案 |
| `required` | `boolean` | — | 标签旁显示 * |
| `htmlFor` | `string` | — | 关联控件 id |
| `children` | `ReactNode` | — | 控件 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`Field.less`。类名：`.tw-field`。
