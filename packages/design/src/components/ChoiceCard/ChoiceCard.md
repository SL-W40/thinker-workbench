# ChoiceCard

可选卡片（主题选择等），`role="option"`。

## 导入

```ts
import { ChoiceCard } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<ChoiceCard selected={v === "a"} onSelect={() => setV("a")} swatch={<Swatch />}>
  <strong>暖色</strong>
  <span>浅底墨色</span>
</ChoiceCard>
```

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `selected` | `boolean` | — | **必填** 是否选中 |
| `onSelect` | `() => void` | — | **必填** 选中回调 |
| `swatch` | `ReactNode` | — | 左侧色块 / 预览 |
| `disabled` | `boolean` | — | 禁用 |
| `aria-label` | `string` | — | 无障碍名称 |
| `children` | `ReactNode` | — | 标题与说明 |
| `className` | `string` | — | 追加 class |

## 样式

文件：`ChoiceCard.less`。类名：`.tw-choice-card`。
