/**
 * 发消息：掐断当前运行（原位重发前用）与本轮的投递、排队、失败收束。
 * 依赖已装配的 edit / queue / persistence，彼此之间只在本文件内直接调用。
 */

import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import {
  type ChatImageRef,
  type ChatMessage,
  createTraceId,
  PREVIEW_BODY_CHARS,
  withTextPreview,
} from "@thinker-workbench/shared";
import { cancelAgent, runAgent } from "../../../platform/ipc/thinker";
import {
  createSession,
  getActiveSessionId,
  getLastWorkspaceId,
  getSession,
  listWorkspaces,
  setActiveSession,
  setLastWorkspaceId,
} from "../../../platform/ipc/workspaces";
import { appLog } from "../../../platform/logging";
import type { useT } from "../../../ui/i18n/useI18n";
import { chatSubmitBlocked } from "../composer/chatSubmit";
import { extractAttachmentIds, extractContextPaths } from "../composer/composerMentions";
import type { WorkspaceGate } from "../composer/useDraftImages";
import { localElapsedMs } from "../message/messageClock";
import { createMessage, failAssistantMessage, toAgentHistory } from "../message/messageModel";
import { classifyRunError, softStopResumeKind } from "../shared/runErrors";
import { isUnlockDeniedError } from "../shared/systemErrors";
import { pickRicherTimeline, withQueuedWait } from "../timeline";
import { upsertLiveRunSlot } from "./liveRunRegistry";
import type { ChatMessageEdit } from "./useChatMessageEdit";
import type { ChatPersistence } from "./useChatPersistence";
import type { ChatRunQueue } from "./useChatRunQueue";
import type { ChatRunState } from "./useChatRunState";

type Translate = ReturnType<typeof useT>;

export type SessionSenderDeps = {
  busy: boolean;
  clearDraftAttachments: () => void;
  draft: string;
  draftAttachmentsRef: { current: ChatAttachmentRef[] };
  edit: ChatMessageEdit;
  ensureModelSecrets: () => Promise<boolean>;
  flushTodos: () => void;
  inputRef: { current: null | { focus: () => void } };
  persistence: ChatPersistence;
  queue: ChatRunQueue;
  requestStickToBottom: () => void;
  run: ChatRunState;
  setActiveTraceId: (id: string | null) => void;
  setBusy: (v: boolean) => void;
  setCanResume: (v: boolean | "cancelled" | "crashed") => void;
  setDraft: (text: string) => void;
  setSessionId: (id: string | null) => void;
  setThreadId: (id: string | undefined) => void;
  setWorkspaceGate: (gate: WorkspaceGate) => void;
  sessionId: string | null;
  showModelSecretGate: () => void;
  submittingRef: { current: boolean };
  syncWorkspaceLabel: (id: string | null) => Promise<void>;
  t: Translate;
  threadId: string | undefined;
  workspaceId: string | null;
};

export function useSessionSender(host: SessionSenderDeps) {
  const {
    busy,
    clearDraftAttachments,
    draft,
    draftAttachmentsRef,
    edit,
    ensureModelSecrets,
    flushTodos,
    inputRef,
    persistence,
    queue,
    requestStickToBottom,
    run,
    setActiveTraceId,
    setBusy,
    setCanResume,
    setDraft,
    setSessionId,
    setThreadId,
    setWorkspaceGate,
    sessionId,
    showModelSecretGate,
    submittingRef,
    syncWorkspaceLabel,
    t,
    threadId,
    workspaceId,
  } = host;
  /** 掐断当前运行但不改消息（原位重发前用，历史由截断覆盖）*/
  function abortRunSilently() {
    run.runEpoch.bump();
    const sid = run.sessionIdRef.current;
    const runId = run.activeRunIdRef.current ?? undefined;
    run.targetMsgIdRef.current = null;
    void cancelAgent({
      ...(runId ? { runId } : {}),
      ...(sid ? { sessionId: sid } : {}),
    });
    run.activeRunIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
    }
    setBusy(false);
    setCanResume(false);
    queue.setQueuedState(false);
  }
  /**
   * @param override 快捷方式 / 原位编辑的正文。
   * @param replaceUserId 从该用户消息截断后重发；未传则追加到末尾。
   */
  async function send(override?: string, replaceUserId?: string | null) {
    const text = (override ?? draft).trim();
    // 进行中或排队：允许改草稿 / 模式 / 附图，但不能再提交
    if (chatSubmitBlocked(busy, queue.queuedRef.current)) return;
    // 本轮要带上最新待办：先把防抖窗口里的改动补写回会话
    flushTodos();
    let sendImages: ChatImageRef[] = [];
    // 统一资产：底部与编辑态都走 @file: 芯片；编辑态资产在 edit.editAttachments
    const assetSource = replaceUserId
      ? edit.editAttachmentsRef.current
      : draftAttachmentsRef.current;
    const referencedAttIds = new Set(extractAttachmentIds(text));
    const draftAtts = assetSource.filter((a) => referencedAttIds.has(a.id));
    // 图片类附件走 image_ref 视觉通道（不进 <context_files> 文本解析）；其余为文档附件
    const imageAtts = draftAtts.filter((a) => a.mime.startsWith("image/"));
    const sendAttachments = draftAtts.filter((a) => !a.mime.startsWith("image/"));
    sendImages = [
      ...sendImages,
      ...imageAtts.map((a) => ({ id: a.id, path: a.path, mime: a.mime, width: 0, height: 0 })),
    ];
    if (!text && sendImages.length === 0 && draftAtts.length === 0) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    // 先解锁钥匙串；仅「拒绝授权」弹窗并中止。未配置密钥不拦截，走气泡内既有引导。
    if (!(await ensureModelSecrets())) {
      submittingRef.current = false;
      return;
    }

    // 必须有活动会话所属的工作空间；有工作空间无会话时自动建会话
    // getSession 返回 { session, messages }，工作空间在 session.workspaceId
    let sid = sessionId ?? (await getActiveSessionId());
    const sess = sid ? await getSession(sid) : null;
    let runThreadId = sess?.session.threadId ?? threadId;
    if (!sess?.session.workspaceId) {
      let wid = workspaceId ?? (await getLastWorkspaceId());
      if (!wid) {
        const workspaces = await listWorkspaces();
        wid = workspaces[0]?.id ?? null;
      }
      if (!wid) {
        setWorkspaceGate({ kind: "no-workspace", message: t("chat.noWorkspace") });
        submittingRef.current = false;
        return;
      }
      const created = await createSession(wid);
      sid = created.id;
      runThreadId = created.threadId;
      // 勿 bump sessionEpoch：会丢掉本轮即将到来的 agent 事件，导致气泡不更新、busy 卡住
      // 立刻挂上 ref，避免随后 threadsChanged 重载时仍指向旧会话
      run.sessionIdRef.current = created.id;
      setSessionId(created.id);
      setThreadId(created.threadId);
      await setActiveSession(created.id);
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
    setWorkspaceGate(null);

    if (replaceUserId) {
      abortRunSilently();
      const idx = run.messagesRef.current.findIndex((m) => m.id === replaceUserId);
      if (idx >= 0) {
        run.commitMessages(run.messagesRef.current.slice(0, idx), { persist: false });
      }
    }
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
    setCanResume(false);
    const traceId = createTraceId();
    setActiveTraceId(traceId);
    const log = appLog("chat.send");
    log.info("submit", {
      traceId,
      threadId: runThreadId,
      meta: {
        ...withTextPreview(text || "(image)", "message", PREVIEW_BODY_CHARS),
        imageCount: sendImages.length,
      },
    });

    const userMsg = createMessage(
      "user",
      text,
      false,
      undefined,
      sendImages.length > 0 ? sendImages : undefined,
      draftAtts.length > 0 ? draftAtts : undefined,
    );
    const pending: ChatMessage = {
      ...createMessage("assistant", "", true, []),
      runStartedAt: Date.now(),
      traceId,
    };
    // 在追加本轮气泡之前快照历史，避免把当前 user / 空助手也塞进模型上下文
    const history = toAgentHistory(run.messagesRef.current);
    run.suppressLiveRef.current = false;
    run.targetMsgIdRef.current = pending.id;
    run.activeRunIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
    }
    run.runEpoch.bump();
    const epoch = run.runEpoch.capture();
    run.commitMessages((prev) => [...prev, userMsg, pending]);
    requestStickToBottom();
    try {
      const contextPaths = extractContextPaths(text);
      const result = await runAgent({
        message: text,
        history,
        threadId: runThreadId,
        sessionId: sid ?? undefined,
        traceId,
        ...(sendImages.length > 0 ? { images: sendImages } : {}),
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
        ...(sendAttachments.length > 0 ? { attachments: sendAttachments } : {}),
      });
      if (run.runEpoch.isStale(epoch)) return;
      if (result.ok && result.runId) {
        run.activeRunIdRef.current = result.runId;
        if (result.queued) {
          const pos = result.queuePosition ?? 1;
          queue.noteQueuePosition(pos);
          queue.setQueuedState(true);
          setBusy(false);
          run.timelineRef.current = withQueuedWait([], t("chat.queued", { position: String(pos) }));
          run.commitMessages(
            (prev) =>
              prev.map((m) =>
                m.id === pending.id
                  ? { ...m, pending: true, timeline: [...run.timelineRef.current] }
                  : m,
              ),
            { persist: false },
          );
          if (sid) {
            upsertLiveRunSlot({
              sessionId: sid,
              threadId: result.threadId || runThreadId || "",
              runId: result.runId,
              messages: run.messagesRef.current,
              targetMsgId: pending.id,
              busy: false,
              streamText: "",
              timeline: run.timelineRef.current,
            });
          }
          if (result.threadId) setThreadId(result.threadId);
          await persistence.flushSave();
          return;
        }
        queue.setQueuedState(false);
        setBusy(true);
        if (sid) {
          upsertLiveRunSlot({
            sessionId: sid,
            threadId: result.threadId || runThreadId || "",
            runId: result.runId,
            messages: run.messagesRef.current,
            targetMsgId: pending.id,
            busy: true,
            streamText: run.streamTextRef.current,
            timeline: run.timelineRef.current,
          });
        }
        if (result.threadId) setThreadId(result.threadId);
        log.info("accepted", {
          traceId,
          runId: result.runId,
          threadId: result.threadId,
        });
        // 终态只经 AgentEvent；勿在此二次改写气泡
        await persistence.flushSave();
        return;
      }

      log.info("result error", {
        traceId,
        runId: result.runId,
        threadId: result.threadId,
        meta: { error: result.ok ? "" : result.error },
      });

      // 钥匙串拒绝兜底：撤回本轮气泡、恢复草稿、弹自定义窗
      if (!result.ok && isUnlockDeniedError(result.error || "")) {
        run.commitMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && m.id !== pending.id),
        );
        setDraft(text);
        showModelSecretGate();
        run.activeRunIdRef.current = null;
        run.targetMsgIdRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
        return;
      }

      // 准入 / 派发前失败：本地收束（账本可能已 emit error，此处兜底）
      const errText = result.ok ? "Unknown error" : result.error || "Unknown error";
      run.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== pending.id) return m;
          const errCode = classifyRunError(errText);
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : errText;
          // 引擎未参与：只有本地墙钟可测（不是推断），拿不到就留「—」
          const elapsed = localElapsedMs(m);
          // 用量：引擎没跑过就没有用量可言，保持未知（「—」），绝不粗估
          const failed = failAssistantMessage(
            { ...m, text: run.streamTextRef.current || m.text },
            display,
            pickRicherTimeline(run.timelineRef.current, m.timeline),
            errCode,
            elapsed,
          );
          run.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      {
        const resume = softStopResumeKind(errText);
        if (resume) setCanResume(resume);
      }
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      setBusy(false);
    } catch (err) {
      if (run.runEpoch.isStale(epoch)) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("result throw", { traceId, meta: { error: msg } });
      run.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== pending.id) return m;
          const errCode = classifyRunError(msg);
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : msg;
          // 引擎未参与：没有用量可言，保持未知（「—」），绝不粗估
          const failed = failAssistantMessage(
            { ...m, text: run.streamTextRef.current || m.text },
            display,
            pickRicherTimeline(run.timelineRef.current, m.timeline),
            errCode,
            localElapsedMs(m),
          );
          run.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      {
        const resume = softStopResumeKind(msg);
        if (resume) setCanResume(resume);
      }
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      setBusy(false);
    } finally {
      submittingRef.current = false;
      if (run.rafRef.current != null) {
        window.cancelAnimationFrame(run.rafRef.current);
        run.rafRef.current = null;
      }
    }
  }
  return { abortRunSilently, send };
}
