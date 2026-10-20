/**
 * 流式渲染调度（纯函数，便于单测）：
 *
 * 目标是在「图看得见在长」与「不抢主线程」之间取平衡：
 * - 流很密时拉长等待，并以上次渲染耗时加权（渲染越慢，下次越晚）；
 * - 流一停（空闲）就尽快出图；
 * - 但无论如何，距上次渲染超过 MAX_INTERVAL_MS 必须补一帧，否则密集流会一直饿着不出图；
 * - 渲染预算耗尽或连续失败则退化为「只在围栏闭合时渲染一次」。
 */

/**
 * token 到达间隔小于此值视为「流很密」。
 * 注意：流式只在「整行边界」排期（见 streamSource.renderablePrefix），
 * 一行一行出来本身就限制了频率，下面的数值是在此之上再压一档，
 * 目标是一秒左右一帧——再快就是肉眼可见的反复重排闪烁。
 */
export const BUSY_GAP_MS = 400;
/** 空闲（流停了）时：多久没变化就出图。 */
export const IDLE_WAIT_MS = 400;
/** 密集流的基础等待。 */
export const BUSY_WAIT_MS = 600;
/** 密集流的等待上限。 */
export const BUSY_MAX_WAIT_MS = 1200;
/** 上次渲染耗时折算系数：渲染越慢，间隔拉得越长。 */
export const COST_FACTOR = 1.5;
/** 计入等待的渲染耗时上限（个别超慢帧不该把间隔无限拉长）。 */
export const COST_CAP_MS = 400;
/** 密集流中「距上次渲染」超过此值必须补一帧。 */
export const MAX_INTERVAL_MS = 1200;
/** 两次渲染的最小间隔：慢速流常常一行一停，别每来一行就整图重排一次。 */
export const MIN_INTERVAL_MS = 700;
/** 单个块的流式渲染次数预算（超出后只等定稿）。 */
export const MAX_RENDERS = 24;
/** 连续失败次数上限（超出说明这段基本渲染不出来）。 */
export const MAX_FAIL_STREAK = 3;

export type SchedulerInput = {
  /** 围栏尚未闭合。 */
  incomplete: boolean;
  /** 上次渲染耗时（ms）。 */
  lastRenderMs: number;
  /** 最近两次 token 到达的间隔（ms）；首次为 0。 */
  arrivalGapMs: number;
  /** 距上次成功/失败渲染的时间（ms）。 */
  sinceLastRenderMs: number;
  /** 本块已渲染次数。 */
  renderCount: number;
  /** 连续失败次数。 */
  failStreak: number;
};

export type SchedulerDecision = {
  /** 还需等待多久才渲染；0 表示尽快。 */
  waitMs: number;
  /** 是否要排一次渲染。 */
  render: boolean;
  /** 是否已降级（此后只在闭合时渲染一次）。 */
  degrade: boolean;
};

/** 是否该退化为「仅闭合后渲染一次」。 */
export function isDegraded(input: SchedulerInput): boolean {
  return input.failStreak >= MAX_FAIL_STREAK || input.renderCount >= MAX_RENDERS;
}

/** 密集流时的等待：基础值 + 上次渲染耗时加权，并封顶。 */
export function busyWaitMs(lastRenderMs: number): number {
  const cost = Math.min(Math.max(lastRenderMs, 0), COST_CAP_MS);
  return Math.min(BUSY_MAX_WAIT_MS, Math.round(BUSY_WAIT_MS + cost * COST_FACTOR));
}

export function nextRenderDelay(input: SchedulerInput): SchedulerDecision {
  const degrade = isDegraded(input);
  // 已闭合：立即定稿（调用方仍会等一帧合并同拍更新）
  if (!input.incomplete) return { waitMs: 0, render: true, degrade };
  // 降级：流式期间不再渲染，等闭合那一次
  if (degrade) return { waitMs: 0, render: false, degrade: true };
  // 密集流里也不能一直饿着：到点必须补一帧，让图看得出在长
  if (input.sinceLastRenderMs >= MAX_INTERVAL_MS) {
    return { waitMs: 0, render: true, degrade: false };
  }
  const busy = input.arrivalGapMs > 0 && input.arrivalGapMs < BUSY_GAP_MS;
  const wait = busy ? busyWaitMs(input.lastRenderMs) : IDLE_WAIT_MS;
  // 距上次渲染太近就再等等：慢速流下这条比上面两条更管用
  const floor = Math.max(0, MIN_INTERVAL_MS - input.sinceLastRenderMs);
  return { waitMs: Math.max(wait, floor), render: true, degrade: false };
}
