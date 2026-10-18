/**
 * 一次 run 的用量账本（纯逻辑，不依赖 ALS / DB，便于单测）。
 *
 * 账本挂在 `RunContext` 上，**子代理派生帧 `{...parentCtx}` 浅拷贝共享同一引用**，
 * 因此 Task 子代理消耗的 token 天然并入父 run——这与 `taskIds` / `hitlIds`
 * 被显式重置成新 Set 的语义正好相反，改动时务必小心。
 */
import { addUsage, EMPTY_USAGE, type ModelUsage, sanitizeUsage } from "@thinker-workbench/shared";

/** 一次 run 的用量账本。 */
export type RunUsageLedger = {
  /** 累计用量。 */
  usage: ModelUsage;
  /** 是否含粗估成分（网关未回 usage，或中断时按已流出正文补算）。 */
  estimated: boolean;
  /** 已入账的模型调用次数；0 表示本 run 从未发生模型调用（终态不下发 usage）。 */
  calls: number;
};

export function createUsageLedger(): RunUsageLedger {
  return { usage: { ...EMPTY_USAGE }, estimated: false, calls: 0 };
}

/**
 * 入账一次模型调用。
 * @param delta 官方用量或粗估用量；非法值（undefined / 非对象）也算一次调用——
 *   调用确实发生了，只是没拿到数，终态仍要下发（可能全 0），不能当作「未知」。
 * @param estimated 本次入账是否为粗估。
 */
export function bookUsage(
  ledger: RunUsageLedger,
  delta: ModelUsage | undefined,
  estimated: boolean,
): void {
  ledger.calls += 1;
  const clean = sanitizeUsage(delta);
  if (clean) ledger.usage = addUsage(ledger.usage, clean);
  if (estimated) ledger.estimated = true;
}

/**
 * 终态结算：本 run 是否发生过模型调用。
 * 没发生过（准入即失败）→ 返回 undefined，UI 展示「—」，不补 0。
 */
export function settleUsage(ledger: RunUsageLedger):
  | {
      usage: ModelUsage;
      estimated: boolean;
    }
  | undefined {
  if (ledger.calls <= 0) return undefined;
  return { usage: { ...ledger.usage }, estimated: ledger.estimated };
}
