/**
 * 内存线程表：ensure 时用首条消息截断作标题，list 按更新时间倒序。
 * 完整对话内容目前主要在图 messages / UI 侧；此处只服务线程列表。
 */
import type { ThreadMeta } from "./types";

export class ThreadStore {
  private threads = new Map<string, ThreadMeta>();

  /** 若线程不存在则创建；存在则刷新 updatedAt。 */
  ensure(threadId: string, titleHint?: string): ThreadMeta {
    const existing = this.threads.get(threadId);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }
    const meta: ThreadMeta = {
      id: threadId,
      title: (titleHint ?? "新对话").slice(0, 48),
      updatedAt: Date.now(),
    };
    this.threads.set(threadId, meta);
    return meta;
  }

  /** 全部线程，最近更新的在前。 */
  list(): ThreadMeta[] {
    return [...this.threads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
