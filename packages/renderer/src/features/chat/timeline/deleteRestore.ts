/**
 * delete_file 的内容恢复与过期清理，受工作空间配置的有效期约束。
 */
import {
  type ChatMessage,
  type ChatTimelineStep,
  DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
} from "@thinker-workbench/shared";

/** 删除恢复缓存是否已过期（ttlDays=0 表示不过期）。 */
export function isDeleteRestoreExpired(
  step: Extract<ChatTimelineStep, { kind: "tool" }>,
  ttlDays: number,
  now = Date.now(),
): boolean {
  if (typeof step.restoreContent !== "string") return true;
  if (ttlDays <= 0) return false;
  const cachedAt = step.restoreCachedAt;
  // 无时间戳的旧数据：视为已过期，不可恢复
  if (typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) return true;
  return now - cachedAt >= ttlDays * 86_400_000;
}

/** 当前设置中的删除恢复 TTL（天）。 */
export function readDeleteFileRestoreTtlDays(): number {
  const sync = window.thinker?.settings?.getGeneralSync?.();
  const n = sync?.deleteFileRestoreTtlDays;
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(0, Math.floor(n))
    : DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS;
}

/**
 * 清掉消息列表里已过期的 delete_file 恢复缓存。
 * @returns 若有变更则返回新数组，否则返回原引用。
 */
export function pruneExpiredDeleteRestoreCaches(
  messages: ChatMessage[],
  ttlDays: number,
  now = Date.now(),
): ChatMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (!m.timeline?.length) return m;
    let timelineChanged = false;
    const timeline = m.timeline.map((s) => {
      if (s.kind !== "tool" || typeof s.restoreContent !== "string") return s;
      if (!isDeleteRestoreExpired(s, ttlDays, now)) return s;
      timelineChanged = true;
      changed = true;
      return {
        id: s.id,
        kind: "tool" as const,
        name: s.name,
        callId: s.callId,
        path: s.path,
        summary: s.summary,
        phase: s.phase,
        ok: s.ok,
        diff: s.diff,
        active: s.active,
        ...(s.restored ? { restored: true as const } : {}),
      };
    });
    return timelineChanged ? { ...m, timeline } : m;
  });
  return changed ? next : messages;
}
