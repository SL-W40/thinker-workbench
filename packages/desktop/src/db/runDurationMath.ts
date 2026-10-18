/**
 * 耗时回填的纯计算部分（不碰 DB，便于单测）。
 * 一次 run 的墙钟 = 同 traceId 全部 span 的最早 start_ts → 最晚 end_ts。
 */
/** 单条 span 的时间窗（回填只需要这两个字段，避免把整表读进内存）。 */
export type SpanWindow = { startTs: number; endTs: number | null };

/**
 * 一组 span 折算成一次 run 的墙钟耗时（ms）。
 * 未结束的 span 用 start_ts 兜底（至少算到它启动的时刻）；无有效 span 返回 undefined。
 */
export function wallClockMsFromSpans(spans: readonly SpanWindow[]): number | undefined {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    if (!Number.isFinite(span.startTs)) continue;
    const end = Number.isFinite(span.endTs) ? (span.endTs as number) : span.startTs;
    if (span.startTs < min) min = span.startTs;
    if (end > max) max = end;
  }
  if (min === Number.POSITIVE_INFINITY) return undefined;
  return Math.max(0, max - min);
}

/**
 * 判断一条消息的 payload 是否需要回填。
 * @returns 需要查询的 traceId；已有耗时或没有 traceId 时返回 undefined（后者保持未知）。
 */
export function traceIdNeedingBackfill(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as { durationMs?: unknown; traceId?: unknown };
  // 已有耗时（哪怕是 0，可能是真实的一瞬间完成）：不覆盖
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) return undefined;
  if (typeof record.traceId !== "string") return undefined;
  const traceId = record.traceId.trim();
  return traceId || undefined;
}

/**
 * 把算好的耗时写回 payload JSON（浅合并，保留 usage / timeline 等全部字段）。
 * @returns 新的 payload 字符串；无需改动返回 null。
 */
export function mergeDurationIntoPayload(
  payloadJson: string | null,
  durationMs: number | undefined,
): string | null {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;
  let payload: Record<string, unknown> = {};
  if (payloadJson) {
    try {
      const parsed = JSON.parse(payloadJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  return JSON.stringify({ ...payload, durationMs: Math.max(0, Math.round(durationMs)) });
}
