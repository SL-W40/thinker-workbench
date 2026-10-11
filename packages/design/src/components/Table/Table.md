# Table

数据表格外壳：语义化 `<table>` + 复合子组件。支持滚动策略、单元格溢出、行拖拽排序（均为配置项）。

## 导入

```ts
import { Table, Badge, Button, reorderTableRows } from "@thinker-workbench/design/react";
```

## 用法

```tsx
<Table
  density="compact"
  scroll={false}
  cellOverflow="ellipsis"
  sortable
  sortHandleLabel="拖拽排序"
  onReorder={(from, to) => setRows((prev) => reorderTableRows(prev, from, to))}
>
  <Table.Head>
    <Table.Row>
      <Table.Header>名称</Table.Header>
      <Table.Header>状态</Table.Header>
      <Table.Header fit>操作</Table.Header>
    </Table.Row>
  </Table.Head>
  <Table.Body>
    {rows.map((row) => (
      <Table.Row key={row.id}>
        <Table.Cell title={row.name}>{row.name}</Table.Cell>
        <Table.Cell>
          <Badge variant="success">正常</Badge>
        </Table.Cell>
        <Table.Cell align="end" fit>
          <Button size="sm" variant="ghost">编辑</Button>
        </Table.Cell>
      </Table.Row>
    ))}
  </Table.Body>
</Table>
```

## API

### `Table`

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | **必填** 表内容 |
| `density` | `"default" \| "compact"` | `"default"` | 行高密度 |
| `scroll` | `false \| true \| "x" \| "y" \| "both"` | `false` | 外层是否滚动；`true` 等同 `"x"` |
| `cellOverflow` | `"wrap" \| "ellipsis" \| "auto"` | `"wrap"` | 默认单元格溢出：换行 / 省略号（弹性列 + `fit` 操作列）/ 按内容撑开 |
| `sortable` | `boolean` | `false` | 行拖拽排序（自动插入手柄列） |
| `onReorder` | `(from, to) => void` | — | 排序完成；下标为表体行 |
| `sortHandleLabel` | `string` | `"Drag to reorder"` | 手柄无障碍文案 |
| `wrapClassName` | `string` | — | 外层容器 class |
| `className` | `string` | — | `<table>` class |

### `Table.Header` / `Table.Cell`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `align` | `"start" \| "end" \| "center"` | 对齐 |
| `overflow` | `"wrap" \| "ellipsis" \| "auto"` | 覆盖表级 `cellOverflow` |
| `fit` | `boolean` | 按内容收缩、不裁切（操作列推荐） |
| `muted` | `boolean` | 仅 Cell：弱化色 |

### 子组件

| 组件 | 元素 | 说明 |
| --- | --- | --- |
| `Table.Head` | `thead` | 表头区 |
| `Table.Body` | `tbody` | 表体区（`sortable` 时为行注入下标） |
| `Table.Row` | `tr` | 行 |
| `Table.Header` | `th` | 列标题 |
| `Table.Cell` | `td` | 单元格 |

### `reorderTableRows`

```ts
reorderTableRows(list, fromIndex, toIndex) => nextList
```

## 样式

文件：`Table.less`。类名：`.tw-table-wrap`、`.tw-table`、`.tw-table__th`、`.tw-table__td`、`.tw-table__drag-handle`。
