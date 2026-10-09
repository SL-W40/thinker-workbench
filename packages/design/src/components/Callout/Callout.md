# Callout

行内信息 / 警告 / 危险提示，不打断页面流程。

## 导入

```ts
import { Callout } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Callout tone="info" title="提示">短说明。</Callout>
<Callout tone="warning">需要注意的事项。</Callout>
<Callout tone="warning" action={<Button size="sm">打开</Button>}>
  还没有工作空间。
</Callout>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `tone` | `info` \| `warning` \| `danger` | `info` | 语气 |
| `title` | `ReactNode` | — | 可选标题 |
| `action` | `ReactNode` | — | 右侧操作（如按钮） |
| `children` | `ReactNode` | — | 正文 |
| `role` | `string` | `note` | 无障碍角色 |
| `className` | `string` | — | 追加 class |
| `...rest` | `HTMLAttributes` | — | 透传 aside 属性 |

## 样式

文件：`Callout.less`。类名：`.tw-callout`、`.tw-callout--*`。
