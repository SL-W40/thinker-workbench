/**
 * 数据表格：语义化 table 外壳 + 复合子组件（Head / Body / Row / Header / Cell）。
 * 支持滚动策略、单元格溢出、行拖拽排序（均为可配置项）。
 */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

export type TableDensity = "default" | "compact";

/** 外层滚动：`false` 不滚动；`true` 等同 `"x"`。 */
export type TableScroll = boolean | "x" | "y" | "both";

/**
 * 单元格溢出策略：
 * - `wrap`：允许换行
 * - `ellipsis`：单行省略号（需表宽受限才生效）
 * - `auto`：按内容撑开宽度，不省略
 */
export type TableCellOverflow = "wrap" | "ellipsis" | "auto";

type TableSectionKind = "head" | "body";

type TableContextValue = {
  cellOverflow: TableCellOverflow;
  sortable: boolean;
  sortHandleLabel: string;
  dragFrom: number | null;
  setDragFrom: (index: number | null) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
};

const TableContext = createContext<TableContextValue | null>(null);
const SectionContext = createContext<TableSectionKind>("body");

function useTableContext(): TableContextValue {
  const ctx = useContext(TableContext);
  if (!ctx) {
    throw new Error("Table.* 必须放在 <Table> 内使用");
  }
  return ctx;
}

function normalizeScroll(scroll: TableScroll): false | "x" | "y" | "both" {
  if (scroll === false) return false;
  if (scroll === true) return "x";
  return scroll;
}

export type TableProps = Omit<HTMLAttributes<HTMLTableElement>, "children"> & {
  children: ReactNode;
  /** 行高密度。默认 `default`。 */
  density?: TableDensity;
  /**
   * 外层是否滚动。默认 `false`（表格随内容撑开，不出现滚动条）。
   * `true` 等同 `"x"`；也可传 `"y"` / `"both"`。
   */
  scroll?: TableScroll;
  /**
   * 默认单元格溢出策略；可被 `Table.Cell` / `Table.Header` 的 `overflow` 覆盖。
   * 默认 `wrap`。
   */
  cellOverflow?: TableCellOverflow;
  /** 是否启用行拖拽排序（自动插入手柄列）。默认 `false`。 */
  sortable?: boolean;
  /** 排序完成回调：`fromIndex` / `toIndex` 为表体行下标。 */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** 拖拽手柄的无障碍文案。 */
  sortHandleLabel?: string;
  /** 追加到外层容器的 class。 */
  wrapClassName?: string;
};

function TableRoot({
  children,
  className,
  density = "default",
  scroll = false,
  cellOverflow = "wrap",
  sortable = false,
  onReorder,
  sortHandleLabel = "Drag to reorder",
  wrapClassName,
  ...rest
}: TableProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const scrollMode = normalizeScroll(scroll);

  const ctx = useMemo<TableContextValue>(
    () => ({
      cellOverflow,
      sortable,
      sortHandleLabel,
      dragFrom,
      setDragFrom,
      onReorder,
    }),
    [cellOverflow, sortable, sortHandleLabel, dragFrom, onReorder],
  );

  const wrapMods = [
    "tw-table-wrap",
    scrollMode ? `tw-table-wrap--scroll-${scrollMode}` : "tw-table-wrap--scroll-none",
    wrapClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const tableMods = [
    "tw-table",
    `tw-table--${density}`,
    `tw-table--cell-${cellOverflow}`,
    sortable ? "tw-table--sortable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TableContext.Provider value={ctx}>
      <div className={wrapMods}>
        <table className={tableMods} {...rest}>
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
}

export type TableSectionProps = HTMLAttributes<HTMLTableSectionElement> & {
  children: ReactNode;
};

function TableHead({ children, className, ...rest }: TableSectionProps) {
  return (
    <SectionContext.Provider value="head">
      <thead className={`tw-table__head${className ? ` ${className}` : ""}`} {...rest}>
        {children}
      </thead>
    </SectionContext.Provider>
  );
}

function TableBody({ children, className, ...rest }: TableSectionProps) {
  const { sortable } = useTableContext();
  const indexed = sortable
    ? Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        return cloneElement(child as ReactElement<TableRowProps>, { rowIndex: index });
      })
    : children;

  return (
    <SectionContext.Provider value="body">
      <tbody className={`tw-table__body${className ? ` ${className}` : ""}`} {...rest}>
        {indexed}
      </tbody>
    </SectionContext.Provider>
  );
}

export type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode;
  /** 表体行下标；启用 `sortable` 时由 `Table.Body` 自动注入。 */
  rowIndex?: number;
};

function GripIcon() {
  return (
    <svg
      className="tw-table__drag-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      focusable="false"
    >
      <circle cx="5.5" cy="4" r="1.15" fill="currentColor" />
      <circle cx="10.5" cy="4" r="1.15" fill="currentColor" />
      <circle cx="5.5" cy="8" r="1.15" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.15" fill="currentColor" />
      <circle cx="5.5" cy="12" r="1.15" fill="currentColor" />
      <circle cx="10.5" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TableRow({
  children,
  className,
  rowIndex,
  onDragOver: onDragOverProp,
  onDragLeave: onDragLeaveProp,
  onDrop: onDropProp,
  ...rest
}: TableRowProps) {
  const section = useContext(SectionContext);
  const { sortable, sortHandleLabel, dragFrom, setDragFrom, onReorder } = useTableContext();
  const isBody = section === "body";
  const index = rowIndex ?? -1;
  const dragging = isBody && dragFrom !== null && dragFrom === index;
  const [over, setOver] = useState(false);

  function onDragOver(e: DragEvent<HTMLTableRowElement>): void {
    if (!sortable || !isBody || dragFrom === null) {
      onDragOverProp?.(e);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(true);
    onDragOverProp?.(e);
  }

  function onDragLeave(e: DragEvent<HTMLTableRowElement>): void {
    setOver(false);
    onDragLeaveProp?.(e);
  }

  function onDrop(e: DragEvent<HTMLTableRowElement>): void {
    if (!sortable || !isBody || dragFrom === null || index < 0) {
      onDropProp?.(e);
      return;
    }
    e.preventDefault();
    setOver(false);
    if (dragFrom !== index) onReorder?.(dragFrom, index);
    setDragFrom(null);
    onDropProp?.(e);
  }

  const rowClass = [
    "tw-table__row",
    dragging ? "is-dragging" : "",
    over && dragFrom !== index ? "is-drag-over" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handle =
    sortable && isBody && index >= 0 ? (
      <td className="tw-table__td tw-table__td--drag tw-table__td--fit">
        <span
          role="button"
          tabIndex={0}
          className="tw-table__drag-handle"
          aria-label={sortHandleLabel}
          title={sortHandleLabel}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(index));
            setDragFrom(index);
          }}
          onDragEnd={() => {
            setDragFrom(null);
            setOver(false);
          }}
          onKeyDown={(e) => {
            // 键盘排序留给上层；此处仅避免空格滚动页面
            if (e.key === " " || e.key === "Enter") e.preventDefault();
          }}
        >
          <GripIcon />
        </span>
      </td>
    ) : sortable && !isBody ? (
      <th className="tw-table__th tw-table__th--drag" aria-hidden />
    ) : null;

  return (
    <tr
      className={rowClass}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...rest}
    >
      {handle}
      {children}
    </tr>
  );
}

function overflowClass(kind: "th" | "td", overflow: TableCellOverflow, fit?: boolean): string {
  if (fit) return `tw-table__${kind}--fit`;
  return `tw-table__${kind}--overflow-${overflow}`;
}

export type TableHeaderProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  children?: ReactNode;
  align?: "start" | "end" | "center";
  /** 覆盖表级 `cellOverflow`。 */
  overflow?: TableCellOverflow;
  /** 按内容收缩、不裁切（适合操作列）。 */
  fit?: boolean;
};

function TableHeader({
  children,
  className,
  align = "start",
  overflow,
  fit,
  ...rest
}: TableHeaderProps) {
  const { cellOverflow } = useTableContext();
  const resolved = overflow ?? cellOverflow;
  return (
    <th
      className={[
        "tw-table__th",
        `tw-table__th--${align}`,
        overflowClass("th", resolved, fit),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      scope="col"
      {...rest}
    >
      {children}
    </th>
  );
}

export type TableCellProps = Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  children?: ReactNode;
  /** 对齐方式。 */
  align?: "start" | "end" | "center";
  /** 弱化次要信息（muted 色）。 */
  muted?: boolean;
  /** 覆盖表级 `cellOverflow`。 */
  overflow?: TableCellOverflow;
  /** 按内容收缩、不裁切（适合操作列）。 */
  fit?: boolean;
};

function TableCell({
  children,
  className,
  align = "start",
  muted,
  overflow,
  fit,
  ...rest
}: TableCellProps) {
  const { cellOverflow } = useTableContext();
  const resolved = overflow ?? cellOverflow;
  return (
    <td
      className={[
        "tw-table__td",
        `tw-table__td--${align}`,
        overflowClass("td", resolved, fit),
        muted ? "is-muted" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </td>
  );
}

/** 数组重排辅助：将 `fromIndex` 项移到 `toIndex`。 */
export function reorderTableRows<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  if (item === undefined) return [...list];
  next.splice(toIndex, 0, item);
  return next;
}

export const Table = Object.assign(TableRoot, {
  Head: TableHead,
  Body: TableBody,
  Row: TableRow,
  Header: TableHeader,
  Cell: TableCell,
});
