# Modal

全局弹窗壳（Portal）。面板随内容增高；过高时在滚动层滚动（蒙层固定不动），并隐藏滚动条。

## 导入

```ts
import { Modal, Button } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Modal open={open} onClose={() => setOpen(false)} closeOnBackdrop closeOnEscape aria-labelledby="t">
  <Modal.Header title="标题" titleId="t" />
  <Modal.Body>正文</Modal.Body>
  <Modal.Footer>
    <Button onClick={() => setOpen(false)}>关闭</Button>
  </Modal.Footer>
</Modal>
```

也可以继续把任意节点放进面板。`Modal.Header` / `Modal.Body` / `Modal.Footer` 只是排版插槽。

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

## 插槽

| 组件 | 属性 | 说明 |
| --- | --- | --- |
| `Modal.Header` | `title` / `titleId` / `children` | 标题行；`children` 在标题右侧 |
| `Modal.Body` | `children` | 正文 |
| `Modal.Footer` | `children` | 底栏，操作靠右 |

## 样式

文件：`Modal.less`。类名：`.tw-modal`、`.tw-modal__scroll`、`.tw-modal__panel`、`.tw-modal__header`、`.tw-modal__body`、`.tw-modal__footer`。蒙层固定；过高内容在滚动层滚（隐藏滚动条）。打开时锁定 `body` 滚动。
