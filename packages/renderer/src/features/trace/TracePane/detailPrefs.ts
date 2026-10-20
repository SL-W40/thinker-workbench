/**
 * Trace 详情面板偏好与选中辅助（localStorage 读写 + 纯函数）。
 */
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import type { TraceRunGroup } from "../callTreeModel";

const DETAIL_WIDTH_KEY = "tw.trace.detailWidth";
const DETAIL_COLLAPSED_KEY = "tw.trace.detailCollapsed";
const DETAIL_WIDTH_DEFAULT = 380;
const DETAIL_WIDTH_MIN = 350;
const DETAIL_WIDTH_MAX = 560;
const DETAIL_RAIL_WIDTH = 40;

export {
  DETAIL_COLLAPSED_KEY,
  DETAIL_RAIL_WIDTH,
  DETAIL_WIDTH_DEFAULT,
  DETAIL_WIDTH_KEY,
  DETAIL_WIDTH_MAX,
  DETAIL_WIDTH_MIN,
};

export function readDetailWidth(): number {
  try {
    const raw = localStorage.getItem(DETAIL_WIDTH_KEY);
    const n = raw ? Number(raw) : DETAIL_WIDTH_DEFAULT;
    if (!Number.isFinite(n)) return DETAIL_WIDTH_DEFAULT;
    return Math.min(DETAIL_WIDTH_MAX, Math.max(DETAIL_WIDTH_MIN, Math.floor(n)));
  } catch {
    return DETAIL_WIDTH_DEFAULT;
  }
}

export function readDetailCollapsed(): boolean {
  try {
    return localStorage.getItem(DETAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** 侧栏短时间：月/日 时:分 */
export function formatShortTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

/** 默认选中时间线上第一个 span（列表按 start_ts 升序）。 */
export function defaultSpanId(rows: TraceSpanRecord[]): string | null {
  return rows[0]?.id ?? null;
}

/** 取最新 run（startTs 最大）。 */
export function latestRunId(groups: TraceRunGroup[]): string | null {
  if (groups.length === 0) return null;
  const first = groups[0];
  if (!first) return null;
  let best = first;
  for (const g of groups) {
    if (g.startTs > best.startTs) best = g;
  }
  return best.runId;
}
