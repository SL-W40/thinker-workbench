/**
 * 聊天会话的状态核心：集中持有本轮 run 的全部可变 ref 与消息提交入口。
 *
 * 拆分动机：useChatSession 原有 25 个 ref 散落一处，29 处 `messagesRef.current = next`
 * 手工赋值造成「state 与 ref 不一致」这一隐性 bug 类别。这里把它们收敛为单一核心：
 * - commitMessages 是消息状态的唯一写者：setMessages + ref 同步 + 防抖落库三者不可分
 * - 落库防抖调度器随核心创建（commitMessages 依赖它，故不放 persistence，避免循环依赖）
 * - 两套 epoch（会话代 / 轮次代）经 createEpochGate 收敛为同一陈旧判定
 *
 * 各特性 Hook（persistence / eventStream / queue / edit）以本核心为入参协作，
 * 而不是把 ref 分给各 Hook——那是把耦合变成跨 Hook 传参爆炸。
 */

import type { ChatMessage, ChatTimelineStep } from "@thinker-workbench/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveSessionMessages } from "../../../platform/ipc/workspaces";
import {
  createDebouncedSave,
  createEpochGate,
  type DebouncedSave,
  type EpochGate,
} from "./chatPersistence";

/** commitMessages 的落库选项；默认落库（防抖）。 */
export type CommitOptions = {
  /** false 表示只更新内存视图、不触发防抖落库（流式中途帧 / hydrate 等）。 */
  persist?: boolean;
};

/** 消息提交入口：支持直接值与 updater（updater 读 messagesRef.current，保证最新）。 */
export type CommitMessages = (
  next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  opts?: CommitOptions,
) => void;

export type ChatRunState = {
  /** 消息列表（React 状态）。 */
  messages: ChatMessage[];
  /** 消息 ref：与 state 同步的读写副本，供异步回调 / 闭包使用。 */
  messagesRef: React.RefObject<ChatMessage[]>;
  /** 消息状态唯一提交入口。 */
  commitMessages: CommitMessages;
  /** 当前直播时间线（未定稿，随事件流累积）。 */
  timelineRef: React.RefObject<ChatTimelineStep[]>;
  /** 流式正文累积器（raf 批量刷入消息 text）。 */
  streamTextRef: React.RefObject<string>;
  /** 直播目标（pending 助手气泡）id。 */
  targetMsgIdRef: React.RefObject<string | null>;
  /** 当前 run id（null 表示未占槽）。 */
  activeRunIdRef: React.RefObject<string | null>;
  /** 当前会话 id（与 sessionId state 同步的 ref 副本）。 */
  sessionIdRef: React.RefObject<string | null>;
  /** 手动停止后抑制直播重挂，直到下一次 send / resume。 */
  suppressLiveRef: React.RefObject<boolean>;
  /** 流式正文刷帧句柄。 */
  rafRef: React.RefObject<number | null>;
  /** shell liveOutput 刷帧句柄（与 LLM 流式分流，避免互相抢帧）。 */
  shellRafRef: React.RefObject<number | null>;
  /** 未刷完的流式帧（可见性变化时补刷）。 */
  flushStreamRef: React.RefObject<(() => void) | null>;
  /** 会话代：切会话 bump，丢弃迟到事件。 */
  sessionEpoch: EpochGate;
  /** 轮次代：发送 / 续跑 / 取消 bump，丢弃迟到的异步结果。 */
  runEpoch: EpochGate;
  /** 防抖落库当前会话消息。 */
  scheduleSave: (nextMessages?: ChatMessage[]) => void;
  /** 取消某会话的待落库且不执行。 */
  cancelSave: (sessionId: string) => void;
  /** 掐断未刷完的流式帧（切会话前用）。 */
  cancelPendingStreamFlush: () => void;
};

/** 创建聊天状态核心。 */
export function useChatRunState(): ChatRunState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  // 落库防抖调度器：稳定单例；随核心创建，供 commitMessages 直接调用
  const [saveScheduler] = useState<DebouncedSave>(createDebouncedSave);
  const sessionIdRef = useRef<string | null>(null);
  const [sessionEpoch] = useState<EpochGate>(createEpochGate);
  const [runEpoch] = useState<EpochGate>(createEpochGate);
  const timelineRef = useRef<ChatTimelineStep[]>([]);
  const streamTextRef = useRef("");
  const targetMsgIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const suppressLiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const shellRafRef = useRef<number | null>(null);
  const flushStreamRef = useRef<(() => void) | null>(null);

  const scheduleSave = useCallback(
    (nextMessages?: ChatMessage[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const payload = nextMessages ?? messagesRef.current;
      saveScheduler.schedule(sid, {
        // 定时器触发时若已切走 / 清空，丢弃过期落库
        valid: () => sessionIdRef.current === sid,
        run: () => {
          void saveSessionMessages(sid, payload).catch(() => {
            // 会话可能已删；主进程已幂等忽略，此处吞掉以免未处理 rejection
          });
        },
      });
    },
    [saveScheduler],
  );

  const cancelSave = useCallback(
    (sessionId: string) => {
      saveScheduler.cancel(sessionId);
    },
    [saveScheduler],
  );

  /**
   * 消息状态唯一写者：先同步 ref（供同步段内的后续读取），再 setState，最后防抖落库。
   * updater 读 messagesRef.current 而非 React 的 prev——在全部写路径都经本入口的
   * 前提下两者等价，且避免了 updater 在渲染期才执行导致的 ref 滞后。
   */
  const commitMessages = useCallback<CommitMessages>(
    (next, opts) => {
      const resolved = typeof next === "function" ? next(messagesRef.current) : next;
      messagesRef.current = resolved;
      setMessages(resolved);
      if (opts?.persist !== false) scheduleSave(resolved);
    },
    [scheduleSave],
  );

  const cancelPendingStreamFlush = useCallback(() => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (shellRafRef.current != null) {
      window.cancelAnimationFrame(shellRafRef.current);
      shellRafRef.current = null;
    }
  }, []);

  // 卸载：掐断未刷帧，取消未落库
  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (shellRafRef.current != null) window.cancelAnimationFrame(shellRafRef.current);
      const sid = sessionIdRef.current;
      if (sid) saveScheduler.cancel(sid);
    };
  }, [saveScheduler]);

  return {
    messages,
    messagesRef,
    commitMessages,
    timelineRef,
    streamTextRef,
    targetMsgIdRef,
    activeRunIdRef,
    sessionIdRef,
    suppressLiveRef,
    rafRef,
    shellRafRef,
    flushStreamRef,
    sessionEpoch,
    runEpoch,
    scheduleSave,
    cancelSave,
    cancelPendingStreamFlush,
  };
}
