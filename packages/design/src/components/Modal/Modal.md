# Modal

全局弹窗壳（Portal）。面板随内容增高；过高时在滚动层滚动（蒙层固定不动），并隐藏滚动条。

## 导入

```ts
import { Modal, Button } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Modal open={open} onClose={() => setOpen(false)} closeOnBackdrop closeOnEscape aria-labelledby="t">
  <h2 id="t">标题</h2>
  <p>正文</p>
  <Button onClick={() => setOpen(false)}>关闭</Button>
</Modal>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | **必填** 是否打开 |
| `children` | `ReactNode` | — | 面板内容 |
| `onClose` | `() => void` | — | 关闭回调 |
| `closeOnBackdrop` | `boolean` | `false` | 点蒙层关闭 |
| `closeOnEscape` | `boolean` | `false` | Escape 关闭 |
| `aria-labelledby` | `string` | — | 标题元素 id |
| `aria-label` | `string` | — | 无 labelledby 时的标签 |
| `className` | `string` | — | 根节点 class |
| `panelClassName` | `string` | — | 面板 class |

## 样式

文件：`Modal.less`。类名：`.tw-modal`、`.tw-modal__scroll`、`.tw-modal__panel`。蒙层固定；过高内容在滚动层滚（隐藏滚动条）。打开时锁定 `body` 滚动。
