/**
 * 段切分与展开：main / task / par 三段式，按 par 视图模式展开为绘制行。
 */
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import {
  clusterParallelTasks,
  type DrawnRow,
  isBackgroundTask,
  type Msg,
  type ParViewMode,
  parKeyOf,
  type Segment,
  type TaskMeta,
  tagForIndex,
  taskTitle,
} from "./layout";

export function buildSegments(
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

export function expandSegments(
  segments: Segment[],
  labels: { main: string; task: string; par: string },
  /** 每个 par 簇当前展示的 Task 下标（滑动模式）。*/
  parSlide: Record<string, number>,
  parView: ParViewMode,
): DrawnRow[] {
  const rows: DrawnRow[] = [];
  for (const seg of segments) {
    if (seg.type === "main") {
      // 多段 main 用首条 span id 区分，避免与其它 main 横幅撞 key
      const headId = seg.msgs[0]?.span.id ?? "empty";
      rows.push({
        kind: "banner",
        rowKey: `banner-main-${headId}`,
        scope: "main",
        title: labels.main,
      });
      for (const msg of seg.msgs) {
        rows.push({ kind: "msg", msg });
      }
      continue;
    }
    if (seg.type === "task") {
      const tk = seg.task;
      rows.push({
        kind: "banner",
        rowKey: `banner-task-${tk.id}`,
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
        rowKey: `banner-par-${key}`,
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
          rowKey: `banner-par-task-${tk.id}`,
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
      rowKey: `banner-par-${key}`,
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
