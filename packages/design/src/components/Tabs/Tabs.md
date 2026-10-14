# Tabs

标签页。`line` 是下划线切换；`document` 是可关闭的文档标签（脏标记圆点，Backspace / Delete 关闭当前项）。

## 导入

```ts
import { Tabs } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Tabs
  aria-label="面板"
  variant="document"
  value={tab}
  onChange={setTab}
  onClose={closeTab}
  tabs={[
    { id: "a", label: "笔记", dirty: true, closable: true, closeLabel: "关闭笔记" },
    { id: "b", label: "终端", closable: true, closeLabel: "关闭终端" },
  ]}
/>
```

方向键在未禁用项之间移动。

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `string` | — | **必填** 当前 id |
| `onChange` | `(id: string) => void` | — | **必填** |
| `tabs` | `TabItem[]` | — | **必填** |
| `onClose` | `(id: string) => void` | — | 关闭 |
| `variant` | `line` \| `document` | `line` | 外观 |
| `aria-label` | `string` | — | **必填** 列表名称 |
| `className` | `string` | — | 追加 class |

## TabItem

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 稳定 id |
| `label` | `string` | 标题 |
| `icon` | `ReactNode` | 标题前图标 |
| `dirty` | `boolean` | 未保存圆点 |
| `disabled` | `boolean` | 禁用 |
| `closable` | `boolean` | 显示关闭 |
| `closeLabel` | `string` | 关闭按钮的无障碍名称 |

## 样式

文件：`Tabs.less`。类名：`.tw-tabs`。
