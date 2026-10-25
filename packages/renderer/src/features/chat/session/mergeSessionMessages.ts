/**
 * 「本地 vs DB」消息合并的唯一真相。
 *
 * 收敛此前三套互不相同的策略：
 * - useChatSession 重载路径（DB 为骨架、逐字段择优）
 * - liveRunRegistry 直播槽路径（本地槽优先、DB 补缺）
 * - sessionReload 纯计数门禁（本地非空而 DB 空时保留本地）
 *
 * 统一原则：计数门禁前置 → 本地非空优先 → 结构化字段逐字段择优 → 未知保持未知。
 */

import type { ChatMessage, ChatTimelineStep } from "@thinker-workbench/shared";
import { pickRicherTimeline } from "../timeline";

/** 直播态的流式投影：目标消息的正文 / 时间线以槽内实时值为准。 */
export type LiveStreamProjection = {
  /** 直播目标（pending 助手气泡）id。 */
  targetMsgId: string;
  /** 槽内累积的流式正文。 */
  streamText: string;
  /** 槽内的实时时间线。 */
  timeline: ChatTimelineStep[];
};

export type MergeSessionMessagesOptions = {
  /** 有直播目标（流式中）：本地槽优先，DB 仅补缺。 */
  hasLiveTarget: boolean;
  /** 直播态投影；hasLiveTarget 时用于丰富目标消息。 */
  live?: LiveStreamProjection;
};

/**
 * 合并 DB 快照与本地消息。
 *
 * - 计数门禁：本地非空而 DB 空，多半是防抖落库未完成，保留本地
 * - 直播中：本地不短于 DB 时整序用本地（保持直播顺序），仅丰富目标消息；
 *   DB 更完整时以 DB 为骨架、同 id 用本地值覆盖
 * - 重载：DB 为骨架逐字段择优——正文 / 时间线取更丰富的一侧，
 *   耗时 / 用量 / 计时锚点本地有值就不许被 DB 旧值（含缺失）覆盖
 */
export function mergeSessionMessages(
  dbMessages: ChatMessage[],
  localMessages: ChatMessage[],
  opts: MergeSessionMessagesOptions,
): ChatMessage[] {
  // 计数门禁前置：本地非空而 DB 空 = 防抖未落库，保留本地
  if (localMessages.length > 0 && dbMessages.length === 0) {
    return [...localMessages];
  }

  const localById = new Map(localMessages.map((m) => [m.id, m]));

  if (opts.hasLiveTarget) {
    const dbById = new Map(dbMessages.map((m) => [m.id, m]));
    const enrich = (m: ChatMessage): ChatMessage => {
      const live = opts.live;
      if (!live || m.id !== live.targetMsgId) return m;
      const db = dbById.get(m.id);
      return {
        ...m,
        text: live.streamText || m.text,
        pending: true,
        timeline: [...live.timeline],
        // 用量非空优先：槽里没有用量时不许把 DB 已有的用量冲掉
        usage: m.usage ?? db?.usage,
        usageEstimated: m.usageEstimated ?? db?.usageEstimated,
      };
    };
    // 本地不短于 DB：整序用本地，仅丰富直播目标
    if (localMessages.length >= dbMessages.length) {
      return localMessages.map(enrich);
    }
    // DB 更完整：以 DB 为骨架，同 id 用本地值覆盖
    const byId = new Map(dbMessages.map((m) => [m.id, m]));
    for (const m of localMessages) byId.set(m.id, m);
    return [...byId.values()];
  }

  // 重载：DB 为骨架逐字段择优。DB 可能是防抖前的旧快照，
  // 绝不能让它盖掉刚结算的耗时 / 用量；只对更完整的字段择优。
  return dbMessages.map((m) => {
    const loc = localById.get(m.id);
    if (!loc || m.role !== "assistant") return m;
    return {
      ...loc,
      ...m,
      text: (loc.text?.length ?? 0) >= (m.text?.length ?? 0) ? (loc.text ?? m.text) : m.text,
      timeline: pickRicherTimeline(loc.timeline ?? [], m.timeline),
      // 耗时 / 用量 / 计时锚点：本地有值就不许 DB 的旧值（含缺失）覆盖
      durationMs: loc.durationMs ?? m.durationMs,
      usage: loc.usage ?? m.usage,
      usageEstimated: loc.usageEstimated ?? m.usageEstimated,
      traceId: loc.traceId ?? m.traceId,
      runStartedAt: loc.runStartedAt ?? m.runStartedAt,
      pending: Boolean(m.pending) && Boolean(loc.pending),
    };
  });
}
