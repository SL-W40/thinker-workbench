/**
 * 日志虚拟表格：定高行 + 可视窗口渲染，控制 DOM / 派生字符串的内存占用。
 */
import type { LogRecord } from "@thinker-workbench/logger";
import { useVirtualWindow } from "./useVirtualWindow";

const ROW_HEIGHT = 32;
/** tooltip 截断，避免把超长 message 挂到 DOM attribute。 */
const TITLE_MAX = 400;

function shortId(id?: string): string {
  if (!id) return "";
  const parts = id.split("_");
  return parts[parts.length - 1]?.slice(0, 8) ?? id.slice(-8);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { hour12: false });
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 列表用短摘要：优先展示正文预览，其余短字段作标签。 */
function summarizeMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  const prefer = [
    "message",
    "lastUser",
    "lastMessage",
    "reply",
    "content",
    "text",
    "output",
    "args",
    "error",
  ];
  const parts: string[] = [];
  for (const key of prefer) {
    const value = meta[key];
    if (value == null || value === "") continue;
    const text = typeof value === "string" ? value : safeJson(value);
    parts.push(clip(text, 96));
    break;
  }
  for (const [key, value] of Object.entries(meta)) {
    if (prefer.includes(key)) continue;
    if (key.endsWith("Chars") || key.endsWith("Truncated") || key === "argKeys") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${clip(String(value), 40)}`);
    } else if (Array.isArray(value)) {
      parts.push(`${key}=[${value.map((v) => String(v)).join(",")}]`);
    }
  }
  return parts.join(" · ");
}

function recordKey(r: LogRecord, i: number): string {
  return `${r.ts}-${r.source}-${r.scope}-${r.message.slice(0, 48)}-${i}`;
}

export type LogVirtualTableProps = {
  records: LogRecord[];
  /** 翻页 / 筛选变化时重置滚动。 */
  resetKey: string | number;
  spanLabel: string;
  openDetailLabel: string;
  onOpenDetail: (record: LogRecord) => void;
  onSelectTrace: (traceId: string) => void;
};

export function LogVirtualTable({
  records,
  resetKey,
  spanLabel,
  openDetailLabel,
  onOpenDetail,
  onSelectTrace,
}: LogVirtualTableProps) {
  const { scrollRef, window, onScroll } = useVirtualWindow({
    count: records.length,
    rowHeight: ROW_HEIGHT,
    overscan: 12,
    resetKey,
  });

  const { start, end, offsetY, totalHeight } = window;

  return (
    <div className="logs-vtable" role="table" aria-rowcount={records.length}>
      <div className="logs-vtable-head" role="row">
        <div role="columnheader">time</div>
        <div role="columnheader">lvl</div>
        <div role="columnheader">src</div>
        <div role="columnheader">scope</div>
        <div role="columnheader">{spanLabel}</div>
        <div role="columnheader">message</div>
        <div role="columnheader">trace</div>
      </div>
      <div
        className="logs-vtable-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        role="rowgroup"
      >
        <div className="logs-vtable-space" style={{ height: totalHeight }}>
          <div
            className="logs-vtable-window"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {records.slice(start, end).map((r, j) => {
              const i = start + j;
              const summary = summarizeMeta(r.meta);
              const msgLine = oneLine(r.message);
              const title = clip(summary ? `${msgLine} · ${summary}` : msgLine, TITLE_MAX);
              return (
                <div
                  key={recordKey(r, i)}
                  className={`logs-vrow is-${r.level}`}
                  data-source={r.source}
                  role="row"
                  aria-rowindex={i + 1}
                  tabIndex={0}
                  aria-label={openDetailLabel}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onOpenDetail(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDetail(r);
                    }
                  }}
                >
                  <div className="logs-time" role="cell">
                    {formatTime(r.ts)}
                  </div>
                  <div role="cell">{r.level}</div>
                  <div role="cell">
                    <span className={`logs-src is-${r.source}`}>{r.source}</span>
                  </div>
                  <div className="logs-scope" role="cell" title={r.scope}>
                    {r.scope}
                  </div>
                  <div className="logs-span-cell" role="cell" title={r.spanId ?? undefined}>
                    {r.spanId ?? "—"}
                  </div>
                  <div className="logs-msg" role="cell" title={title}>
                    <span className="logs-msg-main">{msgLine}</span>
                    {summary ? <span className="logs-meta"> {summary}</span> : null}
                  </div>
                  <div className="logs-trace" role="cell">
                    {r.traceId ? (
                      <button
                        type="button"
                        className="logs-trace-btn"
                        title={r.traceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTrace(r.traceId!);
                        }}
                      >
                        {shortId(r.traceId)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
