/**
 * 启动挂载期的编排副作用：恢复上次会话或工作空间、订阅 threads / workspaces 变更、
 * 前台会话标记、过期恢复缓存清理、后台运行计数、回到前台时冲掉未刷完的流式帧。
 * 只有订阅与一次性恢复，不含会被业务路径直接调用的动作。
 */

import type { ChatMessage, GeneralSettings } from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import { GENERAL_SETTINGS_CHANGED } from "../../../platform/ipc/thinker";
import {
  getActiveSessionId,
  getLastWorkspaceId,
  getSession,
  listSessions,
  listWorkspaces,
  onThreadsChanged,
  onWorkspacesChanged,
  setActiveSession,
  setLastWorkspaceId,
} from "../../../platform/ipc/workspaces";
import { pruneExpiredDeleteRestoreCaches, readDeleteFileRestoreTtlDays } from "../timeline";
import {
  ensureLiveRunRegistry,
  listBusyLiveRuns,
  setForegroundSessionId,
  subscribeLiveRuns,
} from "./liveRunRegistry";
import type { ApplyLoadedSession, ChatPersistence } from "./useChatPersistence";
import type { ChatRunQueue } from "./useChatRunQueue";
import type { ChatRunState } from "./useChatRunState";
export type SessionBootstrapDeps = {
  applyLoadedSession: ApplyLoadedSession;
  inputRef: { current: null | { focus: () => void } };
  persistence: ChatPersistence;
  queue: ChatRunQueue;
  reconcileIfSessionGone: () => Promise<void>;
  requestStickToBottom: () => void;
  run: ChatRunState;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setThreadId: (id: string | undefined) => void;
  syncWorkspaceLabel: (id: string | null) => Promise<void>;
  visible: boolean;
  workspaceId: string | null;
  workspaceIdRef: { current: string | null };
};

export function useSessionBootstrap(host: SessionBootstrapDeps) {
  const {
    applyLoadedSession,
    inputRef,
    persistence,
    queue,
    reconcileIfSessionGone,
    requestStickToBottom,
    run,
    sessionId,
    setSessionId,
    setThreadId,
    syncWorkspaceLabel,
    visible,
    workspaceId,
    workspaceIdRef,
  } = host;
  // 启动：恢复上次会话；否则恢复上次工作空间（及其最近会话）；再否则默认工作空间
  // biome-ignore lint/correctness/useExhaustiveDependencies: 挂载时恢复一次即可；回调内部只读 ref 与稳定 setter
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const workspaces = await listWorkspaces();
      if (cancelled) return;
      if (workspaces.length === 0) {
        await syncWorkspaceLabel(null);
        return;
      }

      const active = await getActiveSessionId();
      if (!cancelled && active) {
        const loaded = await getSession(active);
        if (!cancelled && loaded) {
          run.sessionEpoch.bump();
          run.sessionIdRef.current = loaded.session.id;
          setSessionId(loaded.session.id);
          setThreadId(loaded.session.threadId);
          applyLoadedSession(loaded.session.runStatus, loaded.messages, {
            activeRunId: loaded.session.activeRunId,
          });
          await syncWorkspaceLabel(loaded.session.workspaceId);
          await setLastWorkspaceId(loaded.session.workspaceId);
          requestStickToBottom();
          return;
        }
      }

      const lastWsId = await getLastWorkspaceId();
      const ws = workspaces.find((w) => w.id === lastWsId) ?? workspaces[0] ?? null;
      if (!ws || cancelled) return;
      await setLastWorkspaceId(ws.id);
      await syncWorkspaceLabel(ws.id);

      const sessions = await listSessions(ws.id);
      if (cancelled) return;
      const latest = sessions[0];
      if (!latest) return;
      run.sessionEpoch.bump();
      const loaded = await getSession(latest.id);
      if (cancelled || !loaded) return;
      run.sessionIdRef.current = loaded.session.id;
      setSessionId(loaded.session.id);
      setThreadId(loaded.session.threadId);
      applyLoadedSession(loaded.session.runStatus, loaded.messages, {
        activeRunId: loaded.session.activeRunId,
      });
      await setActiveSession(loaded.session.id);
      requestStickToBottom();
    })();
    return () => {
      cancelled = true;
    };
    // 只在挂载时恢复。放进依赖会反复重载会话并强制贴底。
  }, []);

  // 别名等变更时刷新输入框工作空间名
  useEffect(() => {
    if (!workspaceId) return;
    return onWorkspacesChanged(() => {
      void syncWorkspaceLabel(workspaceId);
    });
  }, [workspaceId, syncWorkspaceLabel]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖故意列入以保持每次渲染都是最新闭包；biome 对不稳定引用的提示在此不适用
  useEffect(() => {
    ensureLiveRunRegistry();
    return onThreadsChanged(() => {
      void reconcileIfSessionGone();
      // 主进程 finalize 后拉终态（刷新期间错过 done 事件时）
      void persistence.reloadCurrentSessionFromDb();
      queue.syncQueueRef.current();
    });
    // 仅挂载订阅；逻辑走 ref
    // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖故意列入以保持每次渲染都是最新闭包；biome 对不稳定引用的提示在此不适用
  }, [persistence.reloadCurrentSessionFromDb, reconcileIfSessionGone]);

  useEffect(() => {
    setForegroundSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    run.sessionIdRef.current = sessionId;
  }, [sessionId, run.sessionIdRef]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  // hydrate / 切会话后顺带清掉已过期的恢复缓存
  useEffect(() => {
    const ttl = readDeleteFileRestoreTtlDays();
    const pruned = pruneExpiredDeleteRestoreCaches(run.messages, ttl);
    if (pruned === run.messages) return;
    run.commitMessages(pruned);
  }, [run.messages, run.commitMessages]);

  useEffect(() => {
    function prune() {
      const ttl = readDeleteFileRestoreTtlDays();
      const next = pruneExpiredDeleteRestoreCaches(run.messagesRef.current, ttl);
      if (next === run.messagesRef.current) return;
      run.commitMessages(next);
    }
    const timer = window.setInterval(prune, 60_000);
    function onSettings(event: Event) {
      const detail = (event as CustomEvent<GeneralSettings>).detail;
      if (detail && typeof detail.deleteFileRestoreTtlDays === "number") {
        prune();
      }
    }
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onSettings);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(GENERAL_SETTINGS_CHANGED, onSettings);
    };
  }, [run.commitMessages, run.messagesRef]);

  const [liveRunTick, setLiveRunTick] = useState(0);
  useEffect(() => {
    return subscribeLiveRuns(() => setLiveRunTick((n) => n + 1));
  }, []);
  const _backgroundRunCount = listBusyLiveRuns().filter((s) => s.sessionId !== sessionId).length;
  void liveRunTick;

  // 回到聊天页：冲掉未刷完的流式帧；不强制滚底（尊重用户阅读位置：
  useEffect(() => {
    if (!visible) return;
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
      run.flushStreamRef.current?.();
    }
  }, [visible, run.rafRef, run.flushStreamRef]);

  useEffect(() => {
    if (!visible) return;
    inputRef.current?.focus();
  }, [visible]);
}
