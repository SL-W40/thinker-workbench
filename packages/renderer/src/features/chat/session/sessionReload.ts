/**
 * 会话从 DB 重载时的覆盖判定：避免防抖落库未完成时，
 * threadsChanged 带着空快照冲掉刚发出的气泡。
 */

/** 是否应用 DB 拉回的消息覆盖本地视图。 */
export function shouldApplySessionReload(opts: {
  /** 当前直播助手气泡 id；有则应由事件流更新。 */
  targetMsgId: string | null;
  localCount: number;
  dbCount: number;
}): boolean {
  if (opts.targetMsgId) return false;
  // 本地已有消息而 DB 尚空：多半是 scheduleSave 未落库，保留本地
  if (opts.localCount > 0 && opts.dbCount === 0) return false;
  return true;
}
