/**
 * 追踪树数据：行标题、按 parentSpanId DFS 扁平化（面向混合图 / Chrome Performance 风）。
 * 树结构以采集侧 parent/taskId 为准，不做历史错挂矫正。
 */
import type { TraceSpanRecord } from "@thinker-workbench/shared";

export type CallTreeRow = {
  span: TraceSpanRecord;
  depth: number;
  hasKids: boolean;
  collapsed: boolean;
  /** 仅在所属 par 内有效的本地色相（0/1/2），不跨 par。 */
  taskColorIdx: number;
  /** size≥2 的并行簇 key；用于整块底色与横幅。 */
  parKey?: string;
  /** 该并行簇内 Task 数。 */
  parSize?: number;
};

type TaskInterval = {
  id: string;
  startTs: number;
  endTs: number;
  background: boolean;
  hasForeground: boolean;
};

function isTaskTool(s: TraceSpanRecord): boolean {
  return /^tool:Task\b/i.test(s.name || "") || s.name === "Task";
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** 按 taskId 墙钟区间聚类并行簇（与时序图一致的重叠规则）。 */
function buildParClusters(
  spans: TraceSpanRecord[],
): Map<string, { key: string; size: number; colorIdx: number }> {
  const byTask = new Map<string, TraceSpanRecord[]>();
  for (const s of spans) {
    if (!s.taskId) continue;
    const list = byTask.get(s.taskId) ?? [];
    list.push(s);
    byTask.set(s.taskId, list);
  }
  const tasks: TaskInterval[] = [...byTask.entries()].map(([id, list]) => {
    let background = false;
    let hasForeground = false;
    for (const s of list) {
      const bg = s.attrs?.background;
      const bgd = s.attrs?.backgrounded;
      if (bg === true || bgd === true) background = true;
      if (bg === false) hasForeground = true;
    }
    return {
      id,
      startTs: Math.min(...list.map((s) => s.startTs)),
      endTs: Math.max(...list.map((s) => s.endTs ?? s.startTs)),
      background,
      hasForeground,
    };
  });
  if (tasks.length === 0) return new Map();

  const sorted = [...tasks].sort((a, b) => a.startTs - b.startTs);
  const useStrict =
    sorted.some((t) => t.background) || sorted.some((t) => t.hasForeground);
  const canPair = (a: TaskInterval, b: TaskInterval): boolean => {
    if (!overlaps(a.startTs, a.endTs, b.startTs, b.endTs)) return false;
    if (!useStrict) return true;
    return a.background && b.background;
  };

  const clusters: TaskInterval[][] = [];
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
        const a = clusters[i]!;
        const b = clusters[j]!;
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

  /** 每个 par 内按启动顺序本地分色；多个 par 之间互不影响。 */
  const out = new Map<string, { key: string; size: number; colorIdx: number }>();
  for (const c of clusters) {
    if (c.length < 2) continue;
    const ordered = [...c].sort(
      (a, b) => a.startTs - b.startTs || a.id.localeCompare(b.id),
    );
    const key = ordered
      .map((t) => t.id)
      .sort()
      .join("|");
    for (let i = 0; i < ordered.length; i++) {
      const t = ordered[i]!;
      out.set(t.id, { key, size: ordered.length, colorIdx: i % 3 });
    }
  }
  return out;
}

function titleFromAttrs(s: TraceSpanRecord): string {
  const t = s.attrs?.title;
  return typeof t === "string" ? t.trim() : "";
}

/** 追踪树行标题。 */
export function callTreeLabel(s: TraceSpanRecord): string {
  const tt = titleFromAttrs(s);
  const name = (s.name || "").trim();
  const summary = (s.summary || "").replace(/\s+/g, " ").trim();

  if (isTaskTool(s)) {
    if (summary.startsWith("Task")) return summary;
    return tt ? `Task · ${tt}` : summary || "Task";
  }
  if (s.kind === "subagent") {
    if (summary.includes("·")) return summary;
    const agent = name.replace(/^subagent:/i, "") || "subagent";
    return tt ? `${agent} · ${tt}` : summary || agent;
  }
  if (s.kind === "model") {
    if (/^model\.candidate/i.test(name) || summary.startsWith("model.candidate")) {
      return summary || name;
    }
    if (summary.startsWith("model.chat")) return summary;
    const m = summary.match(/mdl_[\w]+/) || name.match(/mdl_[\w]+/);
    return m ? `model.chat · ${m[0]}` : "model.chat";
  }
  if (s.kind === "tool") {
    return name.replace(/^tool:/i, "") || summary || "tool";
  }
  if (s.kind === "graph") {
    return name.replace(/^graph\./i, "graph.") || summary || name;
  }
  if (s.kind === "other" || /^(runtime|context|checkpoint|mcp)\./i.test(name)) {
    return summary || name || s.spanId;
  }
  return summary || name || s.spanId;
}

export function spanDurationMs(s: TraceSpanRecord): number {
  return Math.max(0, (s.endTs ?? s.startTs) - s.startTs);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(2)}m`;
}

export function buildCallTreeRows(
  raw: TraceSpanRecord[],
  collapsed: Set<string>,
): { rows: CallTreeRow[]; tMin: number; tMax: number; totalMs: number } {
  const spans = raw.map((s) => ({
    ...s,
    endTs: s.endTs ?? s.startTs,
  }));
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const parByTask = buildParClusters(spans);
  const children = new Map<string, TraceSpanRecord[]>();
  for (const s of spans) children.set(s.spanId, []);
  const roots: TraceSpanRecord[] = [];
  for (const s of spans) {
    const p =
      s.parentSpanId && byId.has(s.parentSpanId) ? s.parentSpanId : null;
    if (!p) roots.push(s);
    else children.get(p)!.push(s);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) => a.startTs - b.startTs || a.spanId.localeCompare(b.spanId),
    );
  }
  roots.sort(
    (a, b) => a.startTs - b.startTs || a.spanId.localeCompare(b.spanId),
  );

  type ParMeta = { key: string; size: number; colorIdx: number; taskId: string };
  const rows: CallTreeRow[] = [];
  const walk = (node: TraceSpanRecord, depth: number, inherit?: ParMeta) => {
    const kids = children.get(node.spanId) || [];
    const isCollapsed = collapsed.has(node.spanId);
    const own =
      node.taskId && parByTask.has(node.taskId)
        ? {
            ...parByTask.get(node.taskId)!,
            taskId: node.taskId,
          }
        : undefined;
    // 子行缺 taskId 时沿用祖先 Task，保证同一 agent 子树同色
    const par = own ?? inherit;
    const spanForRow =
      par && !node.taskId ? { ...node, taskId: par.taskId } : node;
    rows.push({
      span: spanForRow,
      depth,
      hasKids: kids.length > 0,
      collapsed: isCollapsed,
      taskColorIdx: par?.colorIdx ?? 0,
      parKey: par?.key,
      parSize: par?.size,
    });
    if (!isCollapsed) {
      for (const k of kids) walk(k, depth + 1, par);
    }
  };
  for (const r of roots) walk(r, 0);

  if (spans.length === 0) {
    return { rows, tMin: 0, tMax: 0, totalMs: 1 };
  }
  const tMin = Math.min(...spans.map((s) => s.startTs));
  const tMax = Math.max(...spans.map((s) => s.endTs ?? s.startTs));
  return {
    rows,
    tMin,
    tMax,
    totalMs: Math.max(1, tMax - tMin),
  };
}
