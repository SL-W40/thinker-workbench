/**
 * 追踪树：左侧可折叠调用树 + 右侧对齐时间条（混合图正式实现）。 */
import {
  AskModeIcon,
  ChevronRightIcon,
  CodeIcon,
  ConsoleIcon,
  DebugModeIcon,
  type IconProps,
  InfoIcon,
  LanesIcon,
  LogsIcon,
  MaximizeIcon,
  MultitaskModeIcon,
} from "@thinker-workbench/design/react";
import type { TraceSpanKind, TraceSpanRecord } from "@thinker-workbench/shared";
import { type ComponentType, Fragment, type ReactNode, useMemo, useState } from "react";
import { useT } from "../../i18n/useI18n";
import {
  buildCallTreeRows,
  type CallTreeRow,
  callTreeLabel,
  formatDuration,
  spanDurationMs,
  spanTurn,
} from "./callTreeModel";

type Props = {
  spans: TraceSpanRecord[];
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
};

/** ?kind 对应设计系统图标（默认展示；可展开行悬停换成箭头）。*/
const KIND_ICON: Record<TraceSpanKind, ComponentType<IconProps>> = {
  // 图节点：泳道式阶段；工具调用：带 ?的步骤条（区别于 pty 终端窗）
  graph: LanesIcon,
  model: AskModeIcon,
  tool: LogsIcon,
  subagent: MultitaskModeIcon,
  ipc: CodeIcon,
  browser: MaximizeIcon,
  pty: ConsoleIcon,
  hitl: DebugModeIcon,
  other: InfoIcon,
};

type ParTaskGroup = {
  taskId: string;
  colorIdx: number;
  rows: CallTreeRow[];
};

type RowChunk =
  | { type: "plain"; rows: CallTreeRow[] }
  | {
      type: "par";
      key: string;
      size: number;
      rows: CallTreeRow[];
      tasks: ParTaskGroup[];
    };

/** 并行块内?taskId 切成?agent 子块（连续同行同 task）。*/
function groupParTasks(rows: CallTreeRow[]): ParTaskGroup[] {
  const out: ParTaskGroup[] = [];
  for (const row of rows) {
    const taskId = row.span.taskId || `anon-${row.span.spanId}`;
    const last = out[out.length - 1];
    if (last && last.taskId === taskId) {
      last.rows.push(row);
    } else {
      out.push({
        taskId,
        colorIdx: row.taskColorIdx % 3,
        rows: [row],
      });
    }
  }
  return out;
}

/** 把同属一个并行簇的连续行收成带横幅的块。*/
function chunkByPar(rows: CallTreeRow[]): RowChunk[] {
  const out: RowChunk[] = [];
  for (const row of rows) {
    if (row.parKey) {
      const last = out[out.length - 1];
      if (last?.type === "par" && last.key === row.parKey) {
        last.rows.push(row);
      } else {
        out.push({
          type: "par",
          key: row.parKey,
          size: row.parSize ?? 2,
          rows: [row],
          tasks: [],
        });
      }
    } else {
      const last = out[out.length - 1];
      if (last?.type === "plain") last.rows.push(row);
      else out.push({ type: "plain", rows: [row] });
    }
  }
  for (const c of out) {
    if (c.type === "par") c.tasks = groupParTasks(c.rows);
  }
  return out;
}

function KindGlyph({ kind }: { kind: TraceSpanKind }) {
  const Icon = KIND_ICON[kind] ?? InfoIcon;
  return <Icon size="sm" className="trace-calltree__kind-icon" aria-hidden />;
}

export function CallTreeDiagram({ spans, selectedSpanId, onSelect }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const { rows, tMin, totalMs } = useMemo(
    () => buildCallTreeRows(spans, collapsed),
    [spans, collapsed],
  );
  const chunks = useMemo(() => chunkByPar(rows), [rows]);

  const toggle = (spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  const marks = [0, 0.25, 0.5, 0.75, 1];

  const renderRow = (row: CallTreeRow): ReactNode => {
    const s = row.span;
    const selected = s.spanId === selectedSpanId;
    const label = callTreeLabel(s);
    const turn = spanTurn(s);
    const statusClass =
      s.status === "cancelled" ? " is-cancelled" : s.status === "error" ? " is-error" : "";
    const dur = spanDurationMs(s);
    const left = ((s.startTs - tMin) / totalMs) * 100;
    const width = Math.max(0.15, (dur / totalMs) * 100);
    const pad = 8 + row.depth * 14;
    return (
      <div
        key={s.spanId}
        className={`trace-calltree__row${selected ? " is-selected" : ""}${row.hasKids ? " is-expandable" : ""}${statusClass}`}
        onClick={() => onSelect(s.spanId)}
      >
        <div className="trace-calltree__label" style={{ paddingLeft: pad }}>
          <button
            type="button"
            className={`trace-calltree__twisty${row.hasKids ? " is-expandable" : ""}`}
            disabled={!row.hasKids}
            aria-label={row.hasKids ? (row.collapsed ? "expand" : "collapse") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (row.hasKids) toggle(s.spanId);
            }}
          >
            <KindGlyph kind={s.kind} />
            {row.hasKids ? (
              <ChevronRightIcon
                open={!row.collapsed}
                size="sm"
                className="trace-calltree__chevron"
                aria-hidden
              />
            ) : null}
          </button>
          <span className="trace-calltree__kind">{s.kind}</span>
          {turn != null ? (
            <span className="trace-calltree__turn" title={`turn ${turn}`}>
              T{turn}
            </span>
          ) : null}
          <span className="trace-calltree__name" title={label}>
            {label}
          </span>
          <span className="trace-calltree__dur">{formatDuration(dur)}</span>
        </div>
        <div className="trace-calltree__track">
          <div
            className={`trace-calltree__bar trace-calltree__bar--${s.kind}${row.parKey ? ` trace-calltree__bar-task--${row.taskColorIdx}` : ""}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${label} · ${formatDuration(dur)}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="trace-calltree">
      <div className="trace-calltree__ruler">
        <div className="trace-calltree__ruler-inner">
          {marks.map((f) => (
            <span
              key={f}
              className={f === 0 ? "is-start" : f === 1 ? "is-end" : undefined}
              style={{ left: `${f * 100}%` }}
            >
              {formatDuration(totalMs * f)}
            </span>
          ))}
        </div>
      </div>
      <div className="trace-calltree__body">
        {chunks.map((chunk, i) => {
          if (chunk.type === "par") {
            // 只缩进横幅文案；子行保留绝对 depth，避免把树缩进「弄没」
            const parDepth = Math.min(...chunk.rows.map((r) => r.depth));
            const bannerPad = 8 + Math.max(0, parDepth) * 14;
            return (
              <div key={`par-${chunk.key}`} className="trace-calltree__par-band">
                <div className="trace-calltree__par-banner" style={{ paddingLeft: bannerPad }}>
                  {t("tools.trace.scopePar")} · {chunk.size}
                </div>
                {chunk.tasks.map((task) => (
                  <div
                    key={task.taskId}
                    className={`trace-calltree__par-task is-par-task--${task.colorIdx}`}
                  >
                    {task.rows.map(renderRow)}
                  </div>
                ))}
              </div>
            );
          }
          return <Fragment key={`plain-${i}`}>{chunk.rows.map(renderRow)}</Fragment>;
        })}
      </div>
    </div>
  );
}
