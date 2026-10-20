/**
 * 时序图布局模型：泳道归组、消息构建、并行簇切分（纯函数，无 React）。
 */
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { callTreeLabel } from "../callTreeModel";

/** 并行区展示：滑动切换各 Task / 展开全部 Task 分块连排。*/
export type ParViewMode = "swipe" | "expand";

export type LaneId = "renderer" | "desktop" | "runtime" | "graph" | "model" | "tool" | "subagent";

export const LANES: LaneId[] = [
  "renderer",
  "desktop",
  "runtime",
  "graph",
  "model",
  "tool",
  "subagent",
];

export const LANE_LABEL: Record<LaneId, string> = {
  renderer: "Renderer",
  desktop: "Desktop",
  runtime: "Runtime",
  graph: "Graph",
  model: "Model",
  tool: "Tool",
  subagent: "Subagent",
};

export type Msg = {
  seq: number;
  span: TraceSpanRecord;
  from: LaneId;
  to: LaneId;
  label: string;
  scope: "main" | string;
};

export type TaskMeta = {
  id: string;
  title: string;
  startTs: number;
  endTs: number;
  msgs: Msg[];
  background: boolean;
  /** par 内色标字母（A/B/…）。*/
  tag: string;
};

export type Segment =
  | { type: "main"; msgs: Msg[] }
  | { type: "task"; task: TaskMeta; collapsed: boolean }
  | { type: "par"; tasks: TaskMeta[]; collapsed: Set<string> };

export type DrawnRow =
  | {
      kind: "banner";
      /** React list key；按语义身份，不用行下标。 */
      rowKey: string;
      scope: "main" | "par" | string;
      title: string;
      subtitle?: string;
      collapsed?: boolean;
      taskIds?: string[];
      /** par 内 Task 分块条（矮条 + 色标）。*/
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
export function parKeyOf(tasks: TaskMeta[]): string {
  return tasks
    .map((t) => t.id)
    .sort()
    .join("|");
}

export function laneOf(span: TraceSpanRecord): LaneId {
  if (span.source === "app") return "renderer";
  if (span.source === "desktop") return "desktop";
  const name = (span.name || "").toLowerCase();
  // 优先按 name 前缀归泳
  if (name.startsWith("mcp.")) return "tool";
  if (name.startsWith("graph.")) return "graph";
  if (name.startsWith("model.")) return "model";
  if (name.startsWith("subagent:")) return "subagent";
  if (name.startsWith("tool:")) return "tool";
  if (
    name.startsWith("runtime.") ||
    name.startsWith("context.") ||
    name.startsWith("checkpoint.")
  ) {
    return "runtime";
  }
  switch (span.runType) {
    case "chain":
      return name.startsWith("subagent") ? "subagent" : "graph";
    case "llm":
      return "model";
    case "tool":
      return "tool";
    default:
      return "runtime";
  }
}

/** 时序短标签：与追踪树同一套关键规则，再压到箭头宽度。 */
export function displayLabel(span: TraceSpanRecord): string {
  const raw = callTreeLabel(span);
  return raw.length > 20 ? `${raw.slice(0, 18)}…` : raw;
}

/** 估算标签宽度（等宽近似），用于背景条与碰撞偏移。*/
export function estimateLabelW(label: string): number {
  return Math.min(160, 8 + label.length * 6.2);
}

export function scopeOf(span: TraceSpanRecord, all: TraceSpanRecord[]): "main" | string {
  if (span.taskId?.trim()) return span.taskId.trim();
  const callId = typeof span.attrs?.callId === "string" ? span.attrs.callId.trim() : "";
  if (span.runType === "tool" && /task/i.test(span.name) && callId) {
    if (all.some((s) => s.taskId === callId)) return callId;
  }
  return "main";
}

export function taskTitle(taskId: string, spans: TraceSpanRecord[]): string {
  const sub = spans.find((s) => s.taskId === taskId && /^subagent:/i.test(s.name || ""));
  if (sub) return callTreeLabel(sub);
  const tool = spans.find(
    (s) =>
      (s.taskId === taskId || s.attrs?.callId === taskId) &&
      s.runType === "tool" &&
      /task/i.test(s.name),
  );
  if (tool) return callTreeLabel(tool);
  return taskId.slice(0, 10);
}

export function inferFromLane(
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
    if (prev.agentRunId && prev.agentRunId === span.agentRunId) return prevLane;
    if (prev.traceId && prev.traceId === span.traceId) return prevLane;
  }
  if (to === "desktop") return "renderer";
  if (to === "runtime") return "desktop";
  if (to === "graph") return "runtime";
  return to;
}

export function buildMessages(spans: TraceSpanRecord[]): Msg[] {
  // graph 层固定展
  const sorted = [...spans].sort((a, b) => {
    if (a.startTs !== b.startTs) return a.startTs - b.startTs;
    return a.id.localeCompare(b.id);
  });
  const byId = new Map(sorted.map((s) => [s.id, s]));
  return sorted.map((span, idx) => {
    const to = laneOf(span);
    const parent = span.parentId ? byId.get(span.parentId) : undefined;
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

export function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

export function isBackgroundTask(msgs: Msg[]): boolean {
  for (const m of msgs) {
    const attrs = m.span.attrs;
    if (attrs && attrs.background === true) return true;
    if (attrs && attrs.backgrounded === true) return true;
  }
  return false;
}

export function hasExplicitForeground(task: TaskMeta): boolean {
  for (const m of task.msgs) {
    if (m.span.attrs && m.span.attrs.background === false) return true;
  }
  return false;
}

export function clusterParallelTasks(tasks: TaskMeta[]): TaskMeta[][] {
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

export function tagForIndex(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}
