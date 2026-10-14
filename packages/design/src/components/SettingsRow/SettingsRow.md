# SettingsRow

设置页的一行：左侧标题和说明，右侧放开关、选择等控件。长控件用 `stack` 落到标题下面。

## 导入

```ts
import { SettingsRow, Switch } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<div>
  <SettingsRow title="通知" description="完成后弹出系统通知。">
    <Switch checked={on} aria-label="通知" onChange={setOn} />
  </SettingsRow>
  <SettingsRow stack title="备注" description="可选。">
    <Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="备注" />
  </SettingsRow>
</div>
```

多行放在同一个父节点里，最后一行不画底边。

## API

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | `ReactNode` | — | **必填** 标题 |
| `description` | `ReactNode` | — | 说明 |
| `children` | `ReactNode` | — | 控件 |
| `stack` | `boolean` | `false` | 控件换行到下方 |
| `htmlFor` | `string` | — | 标题改为 label |
| `className` | `string` | — | 追加 class |

## 样式

文件：`SettingsRow.less`。类名：`.tw-settings-row`。
