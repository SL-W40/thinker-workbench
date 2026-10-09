# EmptyState

空态占位：可选图标、标题、说明与操作。

## 导入

```ts
import { EmptyState, Button, FolderIcon } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<EmptyState
  icon={<FolderIcon size="lg" />}
  title="还没有内容"
  description="创建第一个工作区开始。"
  action={<Button size="sm">开始使用</Button>}
/>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | `string` | — | **必填** 标题 |
| `description` | `string` | — | 说明 |
| `icon` | `ReactNode` | — | 顶部图标 |
| `action` | `ReactNode` | — | 操作区 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`EmptyState.less`。类名：`.tw-empty`。
