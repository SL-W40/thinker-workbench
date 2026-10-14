# Disclosure

可折叠分组。标题行可带数量和右侧操作；操作按钮不会触发展开。

## 导入

```ts
import { Disclosure, Button } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Disclosure
  title="工作区"
  count={2}
  open={open}
  onOpenChange={setOpen}
  actions={<Button size="sm" variant="primary">添加</Button>}
>
  <p>分组内容</p>
</Disclosure>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | `ReactNode` | — | **必填** |
| `count` | `number` | — | 标题旁数量 |
| `open` | `boolean` | — | **必填** |
| `onOpenChange` | `(open: boolean) => void` | — | **必填** |
| `actions` | `ReactNode` | — | 标题行右侧 |
| `className` | `string` | — | 根节点 class |
| `panelClassName` | `string` | — | 内容区 class |
| `children` | `ReactNode` | — | 展开后的内容 |

## 样式

文件：`Disclosure.less`。类名：`.tw-disclosure`。
