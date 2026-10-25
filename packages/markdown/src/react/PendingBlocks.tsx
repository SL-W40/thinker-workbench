/**
 * 流式未闭合块的软预览：表格按已收到的行渲染成极淡预览，其它块退化为单行骨架。
 * 目的是流式期间不出现整块高亮跳动。
 */
import { StreamChrome } from "./StreamChrome";

export function PendingTable({ value }: { value: string }) {
  const rows = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
  if (rows.length === 0) {
    return (
      <p className="tw-md-pending-line">
        <span>{value || " "}</span>
        <span className="tw-md-caret" aria-hidden="true" />
      </p>
    );
  }
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const zh =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  return (
    <StreamChrome kind="table" label={zh ? "表格" : "Table"} status="streaming">
      <div className="tw-md-table-wrap tw-md-table-wrap--streaming">
        <table className="tw-md-table--streaming">
          <tbody>
            {rows.map((row, rIndex) => {
              const last = rIndex === rows.length - 1;
              return (
                <tr key={rIndex} className={last ? "tw-md-table-row--live" : undefined}>
                  {Array.from({ length: colCount }, (_, cIndex) => (
                    <td key={cIndex}>
                      {row[cIndex] ?? ""}
                      {last && cIndex === colCount - 1 ? (
                        <span className="tw-md-caret" aria-hidden="true" />
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StreamChrome>
  );
}

export function PendingBlock({ kind, value }: { kind: string; value: string }) {
  if (kind === "table") return <PendingTable value={value} />;
  return (
    <p className="tw-md-pending-line">
      <span className="tw-md-pending-text">{value || " "}</span>
      <span className="tw-md-caret" aria-hidden="true" />
    </p>
  );
}
