/**
 * 落库与 DB 重载：flushSave / reloadCurrentSessionFromDb。
 *
 * 防抖调度器（scheduleSave / cancelSave）随状态核心创建——commitMessages 依赖它，
 * 放这里会与 run-state 形成循环依赖；本 Hook 只保留 DB 侧职责：
 * 立即落库、按合并策略从 DB 重载当前会话。
 */

import type { ChatMessage } from "@thinker-workbench/shared";
import { getSession, saveSessionMessages } from "../../../platform/ipc/workspaces";
import { mergeSessionMessages } from "./mergeSessionMessages";
import { shouldApplySessionReload } from "./sessionReload";
import type { ChatRunState } from "./useChatRunState";

/** 把磁盘会话应用到 UI（由编排核心注入：涉及 busy / queued / canResume 等契约字段）。 */
export type ApplyLoadedSession = (
  runStatus: string | undefined,
  messages: ChatMessage[],
  opts?: { activeRunId?: string | null },
) => void;

export type ChatPersistence = {
  /** 取消防抖并立即落库当前会话（切会话 / 发送前用）。 */
  flushSave: () => Promise<void>;
  /** 从 DB 重载当前会话（主进程 done 收束后 / 刷新重挂失败时）。 */
  reloadCurrentSessionFromDb: () => Promise<void>;
};

/** 创建落库 / 重载能力。 */
export function useChatPersistence(
  state: ChatRunState,
  deps: { applyLoadedSession: ApplyLoadedSession },
): ChatPersistence {
  async function flushSave(): Promise<void> {
    const sid = state.sessionIdRef.current;
    if (!sid) return;
    state.cancelSave(sid);
    try {
      await saveSessionMessages(sid, state.messagesRef.current);
    } catch {
      // 已删会话的落库竞态；主进程已幂等忽略
    }
  }

  async function reloadCurrentSessionFromDb(): Promise<void> {
    const sid = state.sessionIdRef.current;
    if (!sid) return;
    // 已挂上直播目标时由事件流更新，勿被 DB 抢写
    if (state.targetMsgIdRef.current) return;
    const localCountBefore = state.messagesRef.current.length;
    const loaded = await getSession(sid);
    if (!loaded || state.sessionIdRef.current !== sid) return;
    // await 期间可能已发出 / 重挂直播：再判一次，避免空 DB 冲掉气泡
    if (
      !shouldApplySessionReload({
        targetMsgId: state.targetMsgIdRef.current,
        localCount: Math.max(localCountBefore, state.messagesRef.current.length),
        dbCount: loaded.messages.length,
      })
    ) {
      return;
    }
    // 本地优先：DB 可能还是防抖前的旧快照，绝不能让它盖掉刚结算的耗时 / 用量。
    // 只对「DB 更完整」的字段（正文、时间线）择优，其余一切以本地为准。
    const merged = mergeSessionMessages(loaded.messages, state.messagesRef.current, {
      hasLiveTarget: false,
    });
    deps.applyLoadedSession(loaded.session.runStatus, merged, {
      activeRunId: loaded.session.activeRunId,
    });
  }

  return { flushSave, reloadCurrentSessionFromDb };
}
