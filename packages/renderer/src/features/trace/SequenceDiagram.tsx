/**
 * 会话 Trace 时序图：全程共用全局 7 泳道坐标；箭头落点对齐表头生命线。 * 并行 par：展开=?Task 分块连排（避免按墙钟交织出现 AAA…BBB…AAA）；滑动=只看当前 Task。 */
import { ChevronLeftIcon, ChevronRightIcon, IconButton } from "@thinker-workbench/design/react";
import type { TraceSpanKind, TraceSpanRecord } from "@thinker-workbench/shared";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "../../i18n/useI18n";
import { callTreeLabel } from "./callTreeModel";

/** 并行区展示：滑动切换各 Task / 展开全部 Task 分块连排。*/
type ParViewMode = "swipe" | "expand";

type Props = {
  spans: TraceSpanRecord[];
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
};

type LaneId = "renderer" | "desktop" | "runtime" | "graph" | "model" | "tool" | "subagent";

const LANES: LaneId[] = ["renderer", "desktop", "runtime", "graph", "model", "tool", "subagent"];

const LANE_LABEL: Record<LaneId, string> = {
  renderer: "Renderer",
  desktop: "Desktop",
  runtime: "Runtime",
  graph: "Graph",
  model: "Model",
  tool: "Tool",
  subagent: "Subagent",
};

/** 同泳道或 Δx 过小时强制自调用回环，避免零长线只剩箭头尖。*/
const MIN_ARROW_DX = 12;

type Msg = {
  seq: number;
  span: TraceSpanRecord;
  from: LaneId;
  to: LaneId;
  label: string;
  scope: "main" | string;
};

type TaskMeta = {
  id: string;
  title: string;
  startTs: number;
  endTs: number;
  msgs: Msg[];
  background: boolean;
  /** par 内色标字母（A/B/…）。*/
  tag: string;
};

type Segment =
  | { type: "main"; msgs: Msg[] }
  | { type: "task"; task: TaskMeta; collapsed: boolean }
  | { type: "par"; tasks: TaskMeta[]; collapsed: Set<string> };

type DrawnRow =
  | {
      kind: "banner";
      scope: "main" | "par" | string;
      title: string;
      subtitle?: string;
      collapsed?: boolean;
      taskIds?: string[];
      /** par ?Task 分块条（矮条 + 色标）。*/
      parTask?: boolean;
      taskTag?: string;
      taskColorIdx?: number;
    }
  | {
      kind: "msg";
      msg: Msg;
      /** par 内左侧色标。*/
      taskTag?: string;
      taskColorIdx?: number;
      inPar?: boolean;
    };

/** 并行簇稳定 key（用于记住当前滑动页）。*/
function parKeyOf(tasks: TaskMeta[]): string {
  return tasks
    .map((t) => t.id)
    .sort()
    .join("|");
}

function laneOf(span: TraceSpanRecord): LaneId {
  if (span.source === "app") return "renderer";
  if (span.source === "desktop") return "desktop";
  const name = (span.name || "").toLowerCase();
  // other / 杂项：按 name 前缀归泳
  if (name.startsWith("mcp.")) return "tool";
  if (
    name.startsWith("runtime.") ||
    name.startsWith("context.") ||
    name.startsWith("checkpoint.")
  ) {
    return "runtime";
  }
  switch (span.kind as TraceSpanKind) {
    case "graph":
      return "graph";
    case "model":
      return "model";
    case "tool":
      return "tool";
    case "subagent":
      return "subagent";
    case "browser":
    case "pty":
    case "hitl":
      return "desktop";
    case "ipc":
    case "other":
      return "runtime";
    default:
      return "runtime";
  }
}

/** 时序短标签：与追踪树同一套关键规则，再压到箭头宽度。 */
function displayLabel(span: TraceSpanRecord): string {
  const raw = callTreeLabel(span);
  return raw.length > 20 ? `${raw.slice(0, 18)}…` : raw;
}

/** 估算标签宽度（等宽近似），用于背景条与碰撞偏移。*/
function estimateLabelW(label: string): number {
  return Math.min(160, 8 + label.length * 6.2);
}

function scopeOf(span: TraceSpanRecord, all: TraceSpanRecord[]): "main" | string {
  if (span.taskId?.trim()) return span.taskId.trim();
  const callId = typeof span.attrs?.callId === "string" ? span.attrs.callId.trim() : "";
  if (span.kind === "tool" && /task/i.test(span.name) && callId) {
    if (all.some((s) => s.taskId === callId)) return callId;
  }
  return "main";
}

function taskTitle(taskId: string, spans: TraceSpanRecord[]): string {
  const sub = spans.find((s) => s.taskId === taskId && s.kind === "subagent");
  if (sub) return callTreeLabel(sub);
  const tool = spans.find(
    (s) =>
      (s.taskId === taskId || s.attrs?.callId === taskId) &&
      s.kind === "tool" &&
      /task/i.test(s.name),
  );
  if (tool) return callTreeLabel(tool);
  return taskId.slice(0, 10);
}

function inferFromLane(
  span: TraceSpanRecord,
  prev: TraceSpanRecord | undefined,
  to: LaneId,
): LaneId {
  if (prev) {
    const prevLane = laneOf(prev);
    if (to === "desktop" && prevLane === "renderer") return "renderer";
    if (to === "runtime" && (prevLane === "desktop" || prevLane === "renderer")) return prevLane;
    if (to === "graph" && (prevLane === "runtime" || prevLane === "desktop")) return prevLane;
    if (
      to === "model" &&
      (prevLane === "graph" || prevLane === "runtime" || prevLane === "subagent")
    ) {
      return prevLane;
    }
    if (
      to === "tool" &&
      (prevLane === "graph" || prevLane === "model" || prevLane === "subagent")
    ) {
      return prevLane;
    }
    if (to === "subagent" && prevLane === "tool") return "tool";
    if (prev.runId && prev.runId === span.runId) return prevLane;
    if (prev.traceId && prev.traceId === span.traceId) return prevLane;
  }
  if (to === "desktop") return "renderer";
  if (to === "runtime") return "desktop";
  if (to === "graph") return "runtime";
  return to;
}

function buildMessages(spans: TraceSpanRecord[]): Msg[] {
  // graph 层固定展
  const sorted = [...spans].sort((a, b) => {
    if (a.startTs !== b.startTs) return a.startTs - b.startTs;
    return a.spanId.localeCompare(b.spanId);
  });
  const byId = new Map(sorted.map((s) => [s.spanId, s]));
  return sorted.map((span, idx) => {
    const to = laneOf(span);
    const parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined;
    const from = parent ? laneOf(parent) : inferFromLane(span, sorted[idx - 1], to);
    return {
      seq: idx + 1,
      span,
      from,
      to,
      label: displayLabel(span),
      scope: scopeOf(span, spans),
    };
  });
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function isBackgroundTask(msgs: Msg[]): boolean {
  for (const m of msgs) {
    const attrs = m.span.attrs;
    if (attrs && attrs.background === true) return true;
    if (attrs && attrs.backgrounded === true) return true;
  }
  return false;
}

function hasExplicitForeground(task: TaskMeta): boolean {
  for (const m of task.msgs) {
    if (m.span.attrs && m.span.attrs.background === false) return true;
  }
  return false;
}

function clusterParallelTasks(tasks: TaskMeta[]): TaskMeta[][] {
  if (tasks.length === 0) return [];
  const sorted = [...tasks].sort((a, b) => a.startTs - b.startTs);
  const useStrict =
    sorted.some((t) => t.background) || sorted.some((t) => hasExplicitForeground(t));

  const canPair = (a: TaskMeta, b: TaskMeta): boolean => {
    if (!overlaps(a.startTs, a.endTs, b.startTs, b.endTs)) return false;
    if (!useStrict) return true;
    return a.background && b.background;
  };

  const clusters: TaskMeta[][] = [];
  for (const task of sorted) {
    let placed = false;
    for (const c of clusters) {
      if (c.some((t) => canPair(t, task))) {
        c.push(task);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([task]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        if (a.some((ta) => b.some((tb) => canPair(ta, tb)))) {
          a.push(...b);
          clusters.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return clusters.map((c) => c.sort((a, b) => a.startTs - b.startTs));
}

function tagForIndex(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}

function buildSegments(
  msgs: Msg[],
  allSpans: TraceSpanRecord[],
  collapsed: Set<string>,
): Segment[] {
  const byTask = new Map<string, Msg[]>();
  const mainMsgs: Msg[] = [];
  for (const m of msgs) {
    if (m.scope === "main") mainMsgs.push(m);
    else {
      const list = byTask.get(m.scope) ?? [];
      list.push(m);
      byTask.set(m.scope, list);
    }
  }

  const tasks: TaskMeta[] = [...byTask.entries()].map(([id, tMsgs], i) => {
    const startTs = Math.min(...tMsgs.map((m) => m.span.startTs));
    const endTs = Math.max(...tMsgs.map((m) => m.span.endTs ?? m.span.startTs));
    return {
      id,
      title: taskTitle(id, allSpans),
      startTs,
      endTs,
      msgs: tMsgs,
      background: isBackgroundTask(tMsgs),
      tag: tagForIndex(i),
    };
  });

  const clusters = clusterParallelTasks(tasks);
  const clusterOf = new Map<string, TaskMeta[]>();
  for (const c of clusters) {
    for (const t of c) clusterOf.set(t.id, c);
  }

  type Ev =
    | { kind: "main"; msg: Msg; ts: number }
    | { kind: "cluster"; cluster: TaskMeta[]; ts: number };

  const events: Ev[] = [];
  for (const m of mainMsgs) {
    events.push({ kind: "main", msg: m, ts: m.span.startTs });
  }
  const seenCluster = new Set<string>();
  for (const t of tasks) {
    const c = clusterOf.get(t.id) ?? [];
    const key = c
      .map((x) => x.id)
      .sort()
      .join("|");
    if (seenCluster.has(key)) continue;
    seenCluster.add(key);
    events.push({
      kind: "cluster",
      cluster: c,
      ts: Math.min(...c.map((x) => x.startTs)),
    });
  }
  events.sort((a, b) => a.ts - b.ts || (a.kind === "main" ? -1 : 1));

  const segments: Segment[] = [];
  let mainBuf: Msg[] = [];
  const flushMain = () => {
    if (mainBuf.length) {
      segments.push({ type: "main", msgs: mainBuf });
      mainBuf = [];
    }
  };

  const emittedClusters = new Set<string>();
  for (const ev of events) {
    if (ev.kind === "main") {
      mainBuf.push(ev.msg);
      continue;
    }
    flushMain();
    const key = ev.cluster
      .map((x) => x.id)
      .sort()
      .join("|");
    if (emittedClusters.has(key)) continue;
    emittedClusters.add(key);
    // 重新分配 par 内色标 A/B/…
    const tagged = ev.cluster.map((tk, i) => ({ ...tk, tag: tagForIndex(i) }));
    if (tagged.length >= 2) {
      segments.push({
        type: "par",
        tasks: tagged,
        collapsed: new Set([...collapsed].filter((id) => tagged.some((t) => t.id === id))),
      });
    } else {
      const task = tagged[0];
      segments.push({
        type: "task",
        task,
        collapsed: collapsed.has(task.id),
      });
    }
  }
  flushMain();
  return segments;
}

function expandSegments(
  segments: Segment[],
  labels: { main: string; task: string; par: string },
  /** 每个 par 簇当前展示的 Task 下标（滑动模式）。*/
  parSlide: Record<string, number>,
  parView: ParViewMode,
): DrawnRow[] {
  const rows: DrawnRow[] = [];
  for (const seg of segments) {
    if (seg.type === "main") {
      rows.push({ kind: "banner", scope: "main", title: labels.main });
      for (const msg of seg.msgs) {
        rows.push({ kind: "msg", msg });
      }
      continue;
    }
    if (seg.type === "task") {
      const tk = seg.task;
      rows.push({
        kind: "banner",
        scope: tk.id,
        title: `${labels.task}: ${tk.title}`,
        subtitle: tk.id.slice(0, 12),
        collapsed: seg.collapsed,
        taskIds: [tk.id],
      });
      if (!seg.collapsed) {
        for (const msg of tk.msgs) {
          rows.push({ kind: "msg", msg });
        }
      }
      continue;
    }
    const key = parKeyOf(seg.tasks);
    const collapsed = seg.tasks.every((tk) => seg.collapsed.has(tk.id));
    const titles = seg.tasks.map((tk) => `${tk.tag}:${tk.title}`);

    if (parView === "expand") {
      rows.push({
        kind: "banner",
        scope: "par",
        title: `${labels.par} · ${seg.tasks.length}`,
        subtitle: titles.join(" · "),
        collapsed,
        taskIds: seg.tasks.map((tk) => tk.id),
      });
      if (collapsed) continue;
      // 按 Task 启动顺序分块连排：墙钟交织会在「一侧卡住 model.chat」时
      // 打出 AAA…BBB…AAA，叙事断裂；分块可读性更好，时间线仍看上方 Gantt。
      const ordered = [...seg.tasks].sort((a, b) => a.startTs - b.startTs);
      for (let i = 0; i < ordered.length; i++) {
        const tk = ordered[i];
        const taskCollapsed = seg.collapsed.has(tk.id);
        rows.push({
          kind: "banner",
          scope: tk.id,
          title: `${tk.tag} · ${tk.title}`,
          subtitle: tk.id.slice(0, 12),
          collapsed: taskCollapsed,
          taskIds: [tk.id],
          parTask: true,
          taskTag: tk.tag,
          taskColorIdx: i % 3,
        });
        if (taskCollapsed) continue;
        for (const msg of tk.msgs) {
          rows.push({
            kind: "msg",
            msg,
            taskTag: tk.tag,
            taskColorIdx: i % 3,
            inPar: true,
          });
        }
      }
      continue;
    }

    const rawIdx = parSlide[key] ?? 0;
    const idx = Math.max(0, Math.min(seg.tasks.length - 1, rawIdx));
    const active = seg.tasks[idx];
    rows.push({
      kind: "banner",
      scope: "par",
      title: `${labels.par} · ${active.tag}:${active.title}`,
      subtitle: `${idx + 1}/${seg.tasks.length}`,
      collapsed,
      taskIds: seg.tasks.map((tk) => tk.id),
    });
    if (collapsed) continue;
    for (const msg of active.msgs) {
      rows.push({
        kind: "msg",
        msg,
        taskTag: active.tag,
        taskColorIdx: idx % 3,
        inPar: true,
      });
    }
  }
  // 按当前可见顺序重编号，避免分块后序号在 A/B 间乱跳
  let seq = 1;
  return rows.map((r) => (r.kind === "msg" ? { ...r, msg: { ...r.msg, seq: seq++ } } : r));
}

/**
 * 箭头几何：序号徽章靠起点，标签居中在箭头上方，避免与徽章叠在中点。 * Δx 过小则自调用回环。 */
function arrowEndpoints(
  x1: number,
  x2: number,
  y: number,
):
  | {
      mode: "line";
      startX: number;
      endX: number;
      midX: number;
      badgeX: number;
      labelY: number;
      arrowY: number;
    }
  | {
      mode: "loop";
      path: string;
      badgeX: number;
      labelX: number;
      labelY: number;
      arrowY: number;
    } {
  // 行内分层：标签在上 / 箭头在中 / 不把徽章放标签上
  const arrowY = y + 6;
  const labelY = y - 10;
  if (Math.abs(x2 - x1) < MIN_ARROW_DX) {
    const x = x2;
    return {
      mode: "loop",
      path: `M ${x + 5} ${arrowY - 6} C ${x + 24} ${arrowY - 6}, ${x + 24} ${arrowY + 6}, ${x + 5} ${arrowY + 6}`,
      badgeX: x - 14,
      labelX: x + 22,
      labelY,
      arrowY,
    };
  }
  const dirRight = x2 >= x1;
  const startX = dirRight ? x1 + 6 : x1 - 6;
  const endX = dirRight ? x2 - 6 : x2 + 6;
  let midX = (startX + endX) / 2;
  // 徽章贴在起点内侧，与标签中点分离
  const badgeX = dirRight ? startX + 11 : startX - 11;
  // 短箭头时把标签中点往终点挪一点，避免压住序号
  if (Math.abs(midX - badgeX) < 28) {
    midX = dirRight ? Math.min(endX - 8, badgeX + 36) : Math.max(endX + 8, badgeX - 36);
  }
  return { mode: "line", startX, endX, midX, badgeX, labelY, arrowY };
}

export function SequenceDiagram({ spans, selectedSpanId, onSelect }: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(0);
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(() => new Set());
  /** par 键 → 当前滑动页下标。 */
  const [parSlide, setParSlide] = useState<Record<string, number>>({});
  const [parView, setParView] = useState<ParViewMode>("expand");
  const swipeRef = useRef<{
    key: string;
    x0: number;
    y0: number;
    active: boolean;
  } | null>(null);
  const [slideOffset, setSlideOffset] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => setHostW(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const msgs = useMemo(() => buildMessages(spans), [spans]);
  const segments = useMemo(
    () => buildSegments(msgs, spans, collapsedTasks),
    [msgs, spans, collapsedTasks],
  );
  const parClusters = useMemo(
    () =>
      segments
        .filter((s): s is Extract<Segment, { type: "par" }> => s.type === "par")
        .map((s) => ({
          key: parKeyOf(s.tasks),
          tasks: s.tasks,
          collapsed: s.tasks.every((tk) => s.collapsed.has(tk.id)),
        })),
    [segments],
  );
  const rows = useMemo(
    () =>
      expandSegments(
        segments,
        {
          main: t("tools.trace.scopeMain"),
          task: t("tools.trace.scopeTask"),
          par: t("tools.trace.scopePar"),
        },
        parSlide,
        parView,
      ),
    [segments, t, parSlide, parView],
  );

  const taskMetas = useMemo(() => {
    const byTask = new Map<string, Msg[]>();
    for (const m of msgs) {
      if (m.scope === "main") continue;
      const list = byTask.get(m.scope) ?? [];
      list.push(m);
      byTask.set(m.scope, list);
    }
    return [...byTask.entries()].map(([id, tMsgs]) => ({
      id,
      title: taskTitle(id, spans),
      startTs: Math.min(...tMsgs.map((m) => m.span.startTs)),
      endTs: Math.max(...tMsgs.map((m) => m.span.endTs ?? m.span.startTs)),
    }));
  }, [msgs, spans]);

  const gantt = useMemo(() => {
    if (taskMetas.length < 1) return null;
    const mainMsgs = msgs.filter((m) => m.scope === "main");
    const t0 = Math.min(...msgs.map((m) => m.span.startTs), ...taskMetas.map((x) => x.startTs));
    const t1 = Math.max(
      ...msgs.map((m) => m.span.endTs ?? m.span.startTs),
      ...taskMetas.map((x) => x.endTs),
      t0 + 1,
    );
    const mainStart = mainMsgs.length ? Math.min(...mainMsgs.map((m) => m.span.startTs)) : t0;
    const mainEnd = mainMsgs.length
      ? Math.max(...mainMsgs.map((m) => m.span.endTs ?? m.span.startTs))
      : t0;
    return { t0, t1, mainStart, mainEnd, tasks: taskMetas };
  }, [msgs, taskMetas]);

  // 行高需容纳：标签 + 徽章间隙 + 箭头，避免上下行叠字
  const rowH = 52;
  const scopeH = 32;
  const parTaskH = 24;
  const headH = 36;
  const ganttH = gantt && gantt.tasks.length > 0 ? 18 + (1 + gantt.tasks.length) * 16 + 8 : 0;
  // 泳道均分容器宽度（不设最小总宽，避免撑出横向滚动）
  const padL = 0;
  const fallbackW = LANES.length * 80;
  const layoutW = hostW > 0 ? hostW : fallbackW;
  const laneW = layoutW / LANES.length;
  const chartLeft = padL;
  const chartW = LANES.length * laneW;
  const width = chartLeft + chartW + padL;

  const laneCenterX = (lane: LaneId) => chartLeft + LANES.indexOf(lane) * laneW + laneW / 2;

  const rowHOf = (r: DrawnRow | undefined) => {
    if (r?.kind !== "banner") return rowH;
    return r.parTask ? parTaskH : scopeH;
  };

  const rowTop = (yi: number) => {
    let y = headH + ganttH;
    for (let i = 0; i < yi; i++) {
      y += rowHOf(rows[i]);
    }
    return y;
  };
  const rowMid = (yi: number) => {
    const top = rowTop(yi);
    return top + rowHOf(rows[yi]) / 2;
  };
  const totalH = headH + ganttH + rows.reduce((acc, r) => acc + rowHOf(r), 0) + 16;

  /** 并行区整块底色：从 par 横幅到其内部消息底。 */
  const parBands: { y: number; h: number }[] = [];
  {
    let startYi: number | null = null;
    for (let yi = 0; yi < rows.length; yi++) {
      const r = rows[yi];
      const inPar =
        (r.kind === "banner" && (r.scope === "par" || Boolean(r.parTask))) ||
        (r.kind === "msg" && Boolean(r.inPar));
      if (inPar) {
        if (startYi == null) startYi = yi;
      } else if (startYi != null) {
        const y = rowTop(startYi);
        parBands.push({ y, h: rowTop(yi) - y });
        startYi = null;
      }
    }
    if (startYi != null) {
      const y = rowTop(startYi);
      parBands.push({ y, h: rowTop(rows.length) - y });
    }
  }

  const selectedMsg = msgs.find((m) => m.span.spanId === selectedSpanId) ?? null;
  const lifeY0 = headH + ganttH;
  const lifeY1 = totalH - 6;

  function renderArrow(opts: {
    msg: Msg;
    x1: number;
    x2: number;
    yMid: number;
    top: number;
    selected: boolean;
    onPath: boolean;
    inTask: boolean;
    inPar: boolean;
    taskColorIdx?: number;
  }) {
    const { msg: m, x1, x2, yMid, top, selected, onPath, inTask, inPar, taskColorIdx = 0 } = opts;
    const statusClass =
      m.span.status === "error"
        ? " is-error"
        : m.span.status === "cancelled"
          ? " is-cancelled"
          : "";
    const ends = arrowEndpoints(x1, x2, yMid);
    const tickW = 7;
    const tickH = 14;
    const labelW = estimateLabelW(m.label);
    const badgeCy = ends.arrowY;
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG <g> 不能换成 HTML <button>
      <g
        key={m.span.spanId}
        className={`trace-seq__msg${selected ? " is-selected" : ""}${onPath && !selected ? " is-related" : ""}${inTask ? " is-in-task" : ""}${inPar ? ` is-in-par is-par-task--${taskColorIdx % 3}` : ""}${statusClass}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onSelect(m.span.spanId)}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(m.span.spanId);
          }
        }}
      >
        {inPar ? (
          <rect
            x={chartLeft}
            y={top}
            width={chartW}
            height={rowH}
            className={`trace-seq__par-task-band is-par-task--${taskColorIdx % 3}`}
          />
        ) : null}
        <rect
          x={x2 - tickW / 2}
          y={ends.arrowY - tickH / 2}
          width={tickW}
          height={tickH}
          rx={1.5}
          className="trace-seq__activation"
        />
        {ends.mode === "loop" ? (
          <>
            <path
              d={ends.path}
              className="trace-seq__arrow"
              markerEnd={selected ? "url(#trace-arrow-selected)" : "url(#trace-arrow)"}
              fill="none"
            />
            <rect
              x={ends.labelX - 2}
              y={ends.labelY - 11}
              width={labelW}
              height={14}
              rx={3}
              className="trace-seq__label-bg"
            />
            <text x={ends.labelX} y={ends.labelY} className="trace-seq__msg-label">
              {m.label}
            </text>
            <circle cx={ends.badgeX} cy={badgeCy} r={8} className="trace-seq__seq-badge" />
            <text
              x={ends.badgeX}
              y={badgeCy + 3.5}
              textAnchor="middle"
              className="trace-seq__seq-num"
            >
              {m.seq}
            </text>
            <rect
              x={Math.min(ends.badgeX, ends.labelX) - 12}
              y={top + 2}
              width={Math.max(80, labelW + 40)}
              height={rowH - 4}
              className="trace-seq__hit"
            />
          </>
        ) : (
          <>
            <line
              x1={ends.startX}
              y1={ends.arrowY}
              x2={ends.endX}
              y2={ends.arrowY}
              className="trace-seq__arrow"
              markerEnd={selected ? "url(#trace-arrow-selected)" : "url(#trace-arrow)"}
            />
            <rect
              x={ends.midX - labelW / 2}
              y={ends.labelY - 11}
              width={labelW}
              height={14}
              rx={3}
              className="trace-seq__label-bg"
            />
            <text
              x={ends.midX}
              y={ends.labelY}
              textAnchor="middle"
              className="trace-seq__msg-label"
            >
              {m.label}
            </text>
            <circle cx={ends.badgeX} cy={badgeCy} r={8} className="trace-seq__seq-badge" />
            <text
              x={ends.badgeX}
              y={badgeCy + 3.5}
              textAnchor="middle"
              className="trace-seq__seq-num"
            >
              {m.seq}
            </text>
            <rect
              x={Math.min(ends.startX, ends.endX) - 8}
              y={top + 2}
              width={Math.max(32, Math.abs(ends.endX - ends.startX) + 16)}
              height={rowH - 4}
              className="trace-seq__hit"
            />
          </>
        )}
      </g>
    );
  }

  function toggleTasks(ids: string[] | undefined) {
    if (!ids?.length) return;
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      const allCollapsed = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allCollapsed) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function setParIndex(key: string, next: number, count: number) {
    const clamped = Math.max(0, Math.min(count - 1, next));
    setParSlide((prev) => {
      if ((prev[key] ?? 0) === clamped) return prev;
      return { ...prev, [key]: clamped };
    });
  }

  function goPar(key: string, count: number, delta: number) {
    const cur = parSlide[key] ?? 0;
    const next = cur + delta;
    if (next < 0 || next >= count) return;
    setParIndex(key, next, count);
  }

  function onParPointerDown(key: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (parView !== "swipe") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest?.("button")) return;
    swipeRef.current = { key, x0: e.clientX, y0: e.clientY, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onParPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (parView !== "swipe") return;
    const s = swipeRef.current;
    if (!s?.active) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (Math.abs(dx) < Math.abs(dy)) {
      setSlideOffset(0);
      return;
    }
    setSlideOffset(Math.max(-64, Math.min(64, dx)));
  }

  function onParPointerUp(count: number, e: ReactPointerEvent<HTMLDivElement>) {
    const s = swipeRef.current;
    swipeRef.current = null;
    setSlideOffset(0);
    if (parView !== "swipe" || !s?.active) return;
    const dx = e.clientX - s.x0;
    if (dx <= -48) goPar(s.key, count, 1);
    else if (dx >= 48) goPar(s.key, count, -1);
  }

  return (
    <div ref={hostRef} className="trace-seq">
      <svg
        className="trace-seq__svg"
        viewBox={`0 0 ${width} ${totalH}`}
        width="100%"
        height={totalH}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label="sequence diagram"
      >
        <defs>
          <marker
            id="trace-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="trace-seq__arrowhead" />
          </marker>
          <marker
            id="trace-arrow-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="trace-seq__arrowhead is-selected" />
          </marker>
        </defs>

        {/* 泳道底色先铺满，避免 Gantt 左侧露白成「缺口。*/}
        {LANES.map((lane, i) => (
          <g key={`band-${lane}`}>
            <rect
              x={chartLeft + i * laneW}
              y={0}
              width={laneW}
              height={totalH}
              className={`trace-seq__band trace-seq__band--${lane}`}
            />
            {i > 0 ? (
              <line
                x1={chartLeft + i * laneW}
                y1={0}
                x2={chartLeft + i * laneW}
                y2={totalH}
                className="trace-seq__lane-sep"
              />
            ) : null}
          </g>
        ))}

        <rect
          x={chartLeft}
          y={0}
          width={chartW}
          height={headH}
          className="trace-seq__lane-head-bg"
        />

        {LANES.map((lane) => {
          const x = laneCenterX(lane);
          const pillW = Math.min(88, laneW - 8);
          return (
            <g key={lane} className={`trace-seq__lane-head trace-seq__lane-head--${lane}`}>
              <rect
                x={x - pillW / 2}
                y={6}
                width={pillW}
                height={24}
                rx={6}
                className={`trace-seq__lane-pill trace-seq__lane-pill--${lane}`}
              />
              <text
                x={x}
                y={22}
                textAnchor="middle"
                className={`trace-seq__lane-label trace-seq__lane-label--${lane}`}
              >
                {LANE_LABEL[lane]}
              </text>
              <line
                x1={x}
                y1={lifeY0}
                x2={x}
                y2={lifeY1}
                className={`trace-seq__lifeline trace-seq__lifeline--${lane}`}
              />
            </g>
          );
        })}

        {parBands.map((band, i) => (
          <rect
            key={`par-band-${i}`}
            x={chartLeft + 2}
            y={band.y + 1}
            width={Math.max(0, chartW - 4)}
            height={Math.max(0, band.h - 2)}
            rx={6}
            className="trace-seq__par-band"
          />
        ))}

        {gantt && ganttH > 0 ? (
          <g className="trace-seq__gantt" transform={`translate(0, ${headH})`}>
            {/* 时间线只画在泳道宽度内 */}
            <rect
              x={chartLeft}
              y={0}
              width={chartW}
              height={ganttH}
              className="trace-seq__gantt-panel"
            />
            <text x={chartLeft + 10} y={12} className="trace-seq__gantt-caption">
              {t("tools.trace.ganttTitle")}
            </text>
            {(() => {
              const barLeft = chartLeft;
              const barW = chartW;
              const labelW = 72;
              const trackLeft = barLeft + labelW;
              const trackW = Math.max(40, barW - labelW - 4);
              const span = Math.max(1, gantt.t1 - gantt.t0);
              const yMain = 18;
              const mx = trackLeft + ((gantt.mainStart - gantt.t0) / span) * trackW;
              const mw = Math.max(4, ((gantt.mainEnd - gantt.mainStart) / span) * trackW);
              const items = [
                {
                  key: "main",
                  label: t("tools.trace.scopeMainShort"),
                  x: mx,
                  w: mw,
                  y: yMain,
                  cls: "is-main",
                },
                ...gantt.tasks.map((task, i) => {
                  const x = trackLeft + ((task.startTs - gantt.t0) / span) * trackW;
                  const w = Math.max(4, ((task.endTs - task.startTs) / span) * trackW);
                  return {
                    key: task.id,
                    label: task.title.slice(0, 12),
                    x,
                    w,
                    y: yMain + (i + 1) * 16,
                    cls: "is-task",
                  };
                }),
              ];
              return items.map((it) => (
                <g key={it.key}>
                  <rect
                    x={chartLeft}
                    y={it.y}
                    width={chartW}
                    height={16}
                    className={`trace-seq__gantt-row ${it.cls}`}
                  />
                  <text
                    x={chartLeft + 10}
                    y={it.y + 11}
                    className={`trace-seq__gantt-label ${it.cls}`}
                  >
                    {it.label}
                  </text>
                  <rect
                    x={trackLeft}
                    y={it.y + 3}
                    width={trackW}
                    height={10}
                    rx={2}
                    className="trace-seq__gantt-track"
                  />
                  <rect
                    x={it.x}
                    y={it.y + 3}
                    width={it.w}
                    height={10}
                    rx={2}
                    className={`trace-seq__gantt-bar ${it.cls}`}
                  />
                </g>
              ));
            })()}
          </g>
        ) : null}

        {rows.map((r, yi) => {
          if (r.kind === "banner") {
            const y = rowTop(yi);
            const isMain = r.scope === "main";
            const isPar = r.scope === "par";
            const isParTask = Boolean(r.parTask);
            const bannerH = isParTask ? parTaskH : scopeH;
            const clickable = !isMain && (!isPar || isParTask);
            const parKey = isPar && r.taskIds?.length ? [...r.taskIds].sort().join("|") : "";
            const cluster = parKey ? parClusters.find((c) => c.key === parKey) : undefined;
            const hasParControls = Boolean(cluster && cluster.tasks.length >= 2);
            const idx = cluster
              ? Math.max(0, Math.min(cluster.tasks.length - 1, parSlide[parKey] ?? 0))
              : 0;
            const onToggleTasks = () => toggleTasks(r.taskIds);
            const onToggleTasksKeyDown = (e: ReactKeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleTasks(r.taskIds);
              }
            };
            const bannerBody = (
              <>
                <rect
                  x={chartLeft}
                  y={y + 2}
                  width={chartW}
                  height={bannerH - 4}
                  className={`trace-seq__scope-banner${isMain ? " is-main" : isPar ? " is-par" : " is-task"}${isParTask ? ` is-par-task is-par-task--${r.taskColorIdx ?? 0}` : ""}`}
                />
                {isParTask ? (
                  <text
                    x={chartLeft + 10}
                    y={y + bannerH / 2 + 3}
                    className="trace-seq__scope-title is-par-task"
                  >
                    {r.collapsed ? "…" : "…"}
                    {r.title}
                    {r.subtitle ? ` …${r.subtitle}` : ""}
                  </text>
                ) : isPar && hasParControls ? (
                  <foreignObject x={chartLeft} y={y + 2} width={chartW} height={bannerH - 4}>
                    <div
                      className="trace-seq__par-bar"
                      // foreignObject 内需 xhtml 命名空间
                      {...({ xmlns: "http://www.w3.org/1999/xhtml" } as object)}
                      style={
                        parView === "swipe" && !r.collapsed && slideOffset
                          ? { transform: `translateX(${slideOffset * 0.2}px)` }
                          : undefined
                      }
                      onPointerDown={(e) => onParPointerDown(parKey, e)}
                      onPointerMove={onParPointerMove}
                      onPointerUp={(e) => onParPointerUp(cluster?.tasks.length, e)}
                      onPointerCancel={() => {
                        swipeRef.current = null;
                        setSlideOffset(0);
                      }}
                    >
                      <button
                        type="button"
                        className="trace-seq__par-bar-toggle"
                        onClick={onToggleTasks}
                      >
                        {r.collapsed ? "…" : "…"}
                      </button>
                      <span className="trace-seq__par-bar-title">
                        {r.title}
                        {r.subtitle ? ` …${r.subtitle}` : ""}
                      </span>
                      {parView === "swipe" && !r.collapsed ? (
                        <span className="trace-seq__par-bar-pager">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label={t("tools.trace.parSwipePrev")}
                            disabled={idx <= 0}
                            onClick={() => goPar(parKey, cluster?.tasks.length, -1)}
                          >
                            <ChevronLeftIcon />
                          </IconButton>
                          <span>
                            {idx + 1}/{cluster?.tasks.length}
                          </span>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            aria-label={t("tools.trace.parSwipeNext")}
                            disabled={idx >= cluster?.tasks.length - 1}
                            onClick={() => goPar(parKey, cluster?.tasks.length, 1)}
                          >
                            <ChevronRightIcon />
                          </IconButton>
                        </span>
                      ) : null}
                      <span
                        className="trace-seq__par-bar-mode"
                        role="group"
                        aria-label={t("tools.trace.parViewLabel")}
                      >
                        <button
                          type="button"
                          className={parView === "expand" ? "is-active" : ""}
                          onClick={() => setParView("expand")}
                        >
                          {t("tools.trace.parViewExpand")}
                        </button>
                        <button
                          type="button"
                          className={parView === "swipe" ? "is-active" : ""}
                          onClick={() => setParView("swipe")}
                        >
                          {t("tools.trace.parViewSwipe")}
                        </button>
                      </span>
                    </div>
                  </foreignObject>
                ) : isPar ? (
                  // biome-ignore lint/a11y/useSemanticElements: SVG <text> 不能换成 HTML <button>
                  <text
                    x={chartLeft + 10}
                    y={y + bannerH / 2 + 3}
                    className="trace-seq__scope-title is-par"
                    role="button"
                    tabIndex={0}
                    aria-expanded={!r.collapsed}
                    style={{ cursor: "pointer" }}
                    onClick={onToggleTasks}
                    onKeyDown={onToggleTasksKeyDown}
                  >
                    {r.collapsed ? "…" : "…"}
                    {r.title}
                    {r.subtitle ? ` …${r.subtitle}` : ""}
                  </text>
                ) : (
                  <text
                    x={chartLeft + 10}
                    y={y + bannerH / 2 + 3}
                    className={`trace-seq__scope-title${isMain ? " is-main" : " is-task"}`}
                  >
                    {r.collapsed ? "…" : !isMain ? "…" : ""}
                    {r.title}
                    {r.subtitle ? ` …${r.subtitle}` : ""}
                  </text>
                )}
              </>
            );
            const rowClass = `trace-seq__scope-row${isMain ? " is-main" : isPar ? " is-par" : " is-task"}${isParTask ? " is-par-task" : ""}`;
            if (clickable) {
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG <g> 不能换成 HTML <button>
                <g
                  key={`banner-${yi}-${r.scope}`}
                  className={rowClass}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!r.collapsed}
                  style={{ cursor: "pointer" }}
                  onClick={onToggleTasks}
                  onKeyDown={onToggleTasksKeyDown}
                >
                  {bannerBody}
                </g>
              );
            }
            return (
              <g key={`banner-${yi}-${r.scope}`} className={rowClass}>
                {bannerBody}
              </g>
            );
          }

          const m = r.msg;
          const selected = m.span.spanId === selectedSpanId;
          const inTask = m.scope !== "main";
          const onPath =
            selected ||
            (selectedMsg != null &&
              (m.span.spanId === selectedMsg.span.parentSpanId ||
                m.span.parentSpanId === selectedSpanId));
          return (
            <g key={`${m.span.spanId}-${yi}`}>
              {renderArrow({
                msg: m,
                x1: laneCenterX(m.from),
                x2: laneCenterX(m.to),
                yMid: rowMid(yi),
                top: rowTop(yi),
                selected,
                onPath,
                inTask,
                inPar: Boolean(r.inPar),
                taskColorIdx: r.taskColorIdx,
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
