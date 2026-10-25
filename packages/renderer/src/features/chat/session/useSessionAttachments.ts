/**
 * 草稿与外部附件：上传落盘、@file 芯片回收、本地草稿存档的写回与卸载冲刷。
 * 只依赖 draft / sessionId / workspaceId 与 setDraft，便于单独立 regression。
 */

import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { saveAttachment } from "../../../platform/ipc/workspaces";
import {
  clearComposerDraft,
  flushComposerDrafts,
  loadComposerDraft,
  saveComposerDraft,
} from "../composer/composerDraft";
import { extractAttachmentIds, formatFileAttachment } from "../composer/composerMentions";
export type SessionAttachmentsDeps = {
  draft: string;
  sessionId: string | null;
  setDraft: Dispatch<SetStateAction<string>>;
  workspaceId: string | null;
};

export function useSessionAttachments(host: SessionAttachmentsDeps) {
  const { draft, sessionId, setDraft, workspaceId } = host;
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachmentRef[]>([]);
  const draftAttachmentsRef = useRef<ChatAttachmentRef[]>(draftAttachments);
  useEffect(() => {
    draftAttachmentsRef.current = draftAttachments;
  }, [draftAttachments]);
  const clearDraftAttachments = useCallback(() => setDraftAttachments([]), []);
  const attachFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;
      const refs: ChatAttachmentRef[] = [];
      for (const f of files) {
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const ref = await saveAttachment(workspaceId, {
            bytes,
            mime: f.type || "application/octet-stream",
            name: f.name,
          });
          refs.push(ref);
        } catch (err) {
          console.error("attachFiles failed", err);
        }
      }
      if (refs.length === 0) return;
      setDraftAttachments((prev) => [...prev, ...refs]);
      const insertText = refs.map((r) => formatFileAttachment(r.id)).join("");
      // 直接追加：@file: 解析已放宽，可紧接前文（无前导空格）成芯片
      setDraft((prev) => prev + insertText);
    },
    [workspaceId],
  );
  const removeAttachment = useCallback((id: string) => {
    setDraftAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);
  /** 草稿文本变化：回收未被 @file: 引用的资产（删除芯片即移除资产）。 */
  const reconcileDraftAttachments = useCallback((text: string) => {
    setDraft(text);
    const ids = new Set(extractAttachmentIds(text));
    setDraftAttachments((prev) => prev.filter((a) => ids.has(a.id)));
  }, []);

  /** 当前草稿已绑到哪个会话（换会话时要撤掉旧会话的存档）。 */
  const draftSessionRef = useRef<string | null>(null);
  /** 本次提交刚灌回了草稿：跳过一次写回，别用中间态覆盖存档。 */
  const skipDraftWriteRef = useRef(false);

  // 启动 / 切会话：先按原语义丢掉旧会话草稿，再把本地存档灌回输入框（刷新、重启都能接上）
  useEffect(() => {
    const prev = draftSessionRef.current;
    draftSessionRef.current = sessionId;
    if (prev && prev !== sessionId) clearComposerDraft(prev);
    if (!sessionId) return;
    const saved = loadComposerDraft(sessionId);
    if (!saved) return;
    skipDraftWriteRef.current = true;
    if (saved.text) setDraft(saved.text);
    // 只复活正文里仍被 @file: 引用的资产，删掉芯片的不再回来
    if (saved.attachments.length > 0) {
      const ids = new Set(extractAttachmentIds(saved.text));
      const refs = saved.attachments.filter((a) => ids.has(a.id));
      if (refs.length > 0) setDraftAttachments(refs);
    }
  }, [sessionId]);

  // 正文 / 附件引用写回本地存档（输入密集，走模块内防抖）
  useEffect(() => {
    if (!sessionId) return;
    if (skipDraftWriteRef.current) {
      skipDraftWriteRef.current = false;
      return;
    }
    saveComposerDraft(sessionId, { text: draft, attachments: draftAttachments });
  }, [sessionId, draft, draftAttachments]);

  // 卸载 / 刷新前冲掉未落盘的草稿
  useEffect(() => {
    window.addEventListener("pagehide", flushComposerDrafts);
    window.addEventListener("beforeunload", flushComposerDrafts);
    return () => {
      window.removeEventListener("pagehide", flushComposerDrafts);
      window.removeEventListener("beforeunload", flushComposerDrafts);
      flushComposerDrafts();
    };
  }, []);
  return {
    attachFiles,
    clearDraftAttachments,
    draftAttachments,
    draftAttachmentsRef,
    reconcileDraftAttachments,
    removeAttachment,
  };
}
