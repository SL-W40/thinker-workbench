/**
 * 落库防抖调度与 epoch 陈旧判定的纯逻辑。
 *
 * 收敛两条独立的 400ms 防抖通道（前台 scheduleSave / 后台槽保存）为一套调度语义，
 * 并把 useChatSession 内 sessionEpoch / runEpoch 两套自造计数器的
 * 「是否已过期」判定收敛为同一实现。
 */

/** 落库防抖毫秒：前台保存与后台槽保存共用同一档。 */
export const SAVE_DEBOUNCE_MS = 400;

/** 一次待落库任务。 */
export type SaveCommit = {
  /** 落库动作。 */
  run: () => void;
  /** 定时器触发时的有效性复核；false 则丢弃本次落库（如已切走会话）。 */
  valid?: () => boolean;
};

/** 按 key 防抖的落库调度器。 */
export type DebouncedSave = {
  /** 登记待落库：同一 key 只保留最后一次，静默 delayMs 后落地。 */
  schedule: (key: string, commit: SaveCommit) => void;
  /** 取消该 key 的待落库且不执行。 */
  cancel: (key: string) => void;
  /** 该 key 是否有尚未落地的待办。 */
  has: (key: string) => boolean;
};

/** 定时器注入（默认走 window；测试可传入手动实现，无需依赖假计时器语义）。 */
export type SaveTimers = {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

const defaultSaveTimers: SaveTimers = {
  // 延迟引用 window：模块被 node 环境导入时不会因缺少 window 而崩
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/**
 * 创建防抖落库调度器。
 *
 * 语义：同一 key 在静默期内多次 schedule 只落地最后一次；
 * 落地前复核 valid，false 则丢弃（切会话后丢弃过期落库）。
 */
export function createDebouncedSave(
  delayMs: number = SAVE_DEBOUNCE_MS,
  timers: SaveTimers = defaultSaveTimers,
): DebouncedSave {
  const pending = new Map<string, { timer: number; commit: SaveCommit }>();

  const cancel = (key: string): void => {
    const entry = pending.get(key);
    if (!entry) return;
    timers.clearTimeout(entry.timer);
    pending.delete(key);
  };

  return {
    schedule(key, commit) {
      cancel(key);
      const timer = timers.setTimeout(() => {
        pending.delete(key);
        if (commit.valid && !commit.valid()) return;
        commit.run();
      }, delayMs);
      pending.set(key, { timer, commit });
    },
    cancel,
    has: (key) => pending.has(key),
  };
}

/**
 * 单调递增的陈旧门闩：bump 使此前所有捕获作废。
 *
 * 用法：异步操作前 capture()，回调落地前 isStale(captured) 判定——
 * true 表示会话已切换 / 新一轮已开始，结果必须丢弃。
 * 注意：suppressLiveRef 是布尔闩而非代际计数（done / error 仍需放行），
 * 由 run-state 单独持有，不并入本门闩。
 */
export type EpochGate = {
  /** 进入新会话 / 新一轮：立即使此前所有捕获作废。 */
  bump: () => void;
  /** 捕获当前代，供异步回调稍后比对。 */
  capture: () => number;
  /** true 表示该捕获已过期，结果必须丢弃。 */
  isStale: (captured: number) => boolean;
};

/** 创建 epoch 门闩；initial 一般取 0。 */
export function createEpochGate(initial = 0): EpochGate {
  let current = initial;
  return {
    bump() {
      current += 1;
    },
    capture: () => current,
    isStale: (captured) => captured !== current,
  };
}
