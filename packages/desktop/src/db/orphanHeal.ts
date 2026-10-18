/**
 * 残留 pending 助手气泡的收束策略（纯函数，不碰 DB）。
 * 与主进程 heal / 取消路径共用：浅合并而非整体替换，避免抹掉引擎已算好的耗时与用量。
 */

/** 时间线里排队等待步的固定 id（收束时要丢掉）。 */
const QUEUED_WAIT_STEP_ID = "queued-wait";

/**
 * 收束一条残留 pending 助手消息的 payload。
 * - 只改 `pending` / `timeline`，其余字段（durationMs / usage / traceId / text）原样保留；
 * - 排队等待步丢弃，活动 thinking 关掉，末尾补一条错误步；
 * - 残留 `runStartedAt` 先按墙钟结算成 `durationMs` 再冻结（崩溃前没来得及结算的情况）。
 */
export function buildOrphanHealPayload(
  payloadJson: string | null,
  rowId: string,
  errorText: string,
  code: string,
): string {
  let payload: Record<string, unknown> = {};
  if (payloadJson) {
    try {
      const parsed = JSON.parse(payloadJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      /* 坏 JSON：退化为只写 timeline，避免整条消息不可用 */
    }
  }

  let timeline = Array.isArray(payload.timeline) ? [...payload.timeline] : [];
  // 排队等待文案不再保留；关掉活动 thinking，并追加错误步
  timeline = timeline.filter((step) => {
    if (!step || typeof step !== "object") return true;
    return (step as { id?: string }).id !== QUEUED_WAIT_STEP_ID;
  });
  timeline = timeline.map((step) => {
    if (step && typeof step === "object" && (step as { kind?: string }).kind === "status") {
      return { ...step, active: false };
    }
    return step;
  });
  timeline.push({
    id: `tl_heal_${rowId}`,
    kind: "error",
    message: errorText,
    // 无 checkpoint 的进程中断：按异常退出展示，便于时间线「继续」识别
    code,
  });

  const settled: Record<string, unknown> = { ...payload, timeline, pending: false };
  // 崩溃前未来得及结算的 runStartedAt：按墙钟补齐一次，再冻结计时字段
  const startedAt = payload.runStartedAt;
  if (typeof startedAt === "number" && typeof settled.durationMs !== "number") {
    settled.durationMs = Math.max(0, Date.now() - startedAt);
  }
  delete settled.runStartedAt;
  return JSON.stringify(settled);
}
