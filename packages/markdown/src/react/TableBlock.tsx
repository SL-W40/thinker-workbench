/**
 * GFM 表格块：StreamChrome 顶栏 + 横向滚动 + 复制/导出。
 */
// biome-ignore-all lint/suspicious/noArrayIndexKey: 表格行 / 列按位置渲染，数据不会中途重排，index 即稳定 key
import type { ReactNode } from "react";
import type { TableAlign } from "../table/serialize";
import type { InlineNode } from "../types";
import { StreamChrome } from "./StreamChrome";
import { TableActions } from "./TableActions";

type Props = {
  headers: InlineNode[][];
  aligns: TableAlign[];
  rows: InlineNode[][][];
  incomplete?: boolean;
  /** 单元格行内渲染。 */
  renderInline: (nodes: InlineNode[]) => ReactNode;
  /** 流式末行 caret 等额外内容。 */
  trailing?: ReactNode;
};

function tableLabel(): string {
  const zh =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  return zh ? "表格" : "Table";
}

export function TableBlock({
  headers,
  aligns,
  rows,
  incomplete = false,
  renderInline,
  trailing,
}: Props) {
  return (
    <StreamChrome
      kind="table"
      label={tableLabel()}
      status={incomplete ? "streaming" : "ready"}
      actions={
        incomplete ? undefined : <TableActions headers={headers} aligns={aligns} rows={rows} />
      }
    >
      <div className={`tw-md-table-wrap${incomplete ? " tw-md-table-wrap--streaming" : ""}`}>
        <table className={incomplete ? "tw-md-table--streaming" : undefined}>
          <thead>
            <tr>
              {headers.map((cell, index) => (
                <th key={index} style={{ textAlign: aligns[index] ?? undefined }}>
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIndex) => {
              const last = incomplete && rIndex === rows.length - 1;
              return (
                <tr key={rIndex} className={last ? "tw-md-table-row--live" : undefined}>
                  {headers.map((_, cIndex) => (
                    <td key={cIndex} style={{ textAlign: aligns[cIndex] ?? undefined }}>
                      {renderInline(row[cIndex] ?? [{ type: "text", value: "" }])}
                      {last && cIndex === headers.length - 1 ? (
                        <span className="tw-md-caret" aria-hidden="true" />
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {incomplete && rows.length === 0 ? (
          <span className="tw-md-caret tw-md-caret--after-table" aria-hidden="true" />
        ) : null}
        {trailing}
      </div>
    </StreamChrome>
  );
}
