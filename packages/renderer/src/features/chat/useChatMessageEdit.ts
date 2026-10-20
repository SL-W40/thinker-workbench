/**
 * 用户消息原位编辑：editingUserId / editDraft / beginEditUserMessage / sendUserEdit / onEditKeyDown。
 *
 * 编辑期只动草稿与资产，历史不动；发送时才由 send(replaceUserId) 从该条截断重发。
 * 资产（图片即附件）与底部草稿共用同一模型：统一落盘为 `ChatAttachmentRef`，
 * 在草稿中以 `@file:<id>` 芯片引用，发送时按 mime 分流（见 useChatSession.send）。
 */

import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import { useRef, useState } from "react";
import { saveAttachment } from "../../bridge/workspaces";
import type { ComposerEditorHandle } from "./ComposerEditor";
import { chatSubmitBlocked } from "./chatSubmit";
import { extractAttachmentIds, formatFileAttachment } from "./composerMentions";
import type { ChatRunState } from "./useChatRunState";

/** 编辑 Hook 需要的外部能力（由编排核心注入）。 */
export type ChatEditDeps = {
  /** 发送；原位重发走 send(text, replaceUserId)。 */
  send: (override?: string, replaceUserId?: string | null) => Promise<void>;
  busy: boolean;
  queued: boolean;
  /** 当前工作空间（资产落盘目录）。 */
  workspaceId: string | null;
};

export type ChatMessageEdit = {
  /** 正在原位编辑的用户消息；未发送前不改历史。 */
  editingUserId: string | null;
  editDraft: string;
  setEditDraft: (value: string) => void;
  editInputRef: React.RefObject<ComposerEditorHandle | null>;
  /** 原位编辑中的统一资产（图片即附件，@file: 芯片展示）。 */
  editAttachments: ChatAttachmentRef[];
  editAttachmentsRef: React.RefObject<ChatAttachmentRef[]>;
  attachEditFiles: (files: File[]) => Promise<void>;
  removeEditAttachment: (id: string) => void;
  /** 退出编辑并清空草稿 / 资产。 */
  clearUserEdit: () => void;
  beginEditUserMessage: (messageId: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  sendUserEdit: () => void;
};

/** 创建原位编辑能力。 */
export function useChatMessageEdit(state: ChatRunState, deps: ChatEditDeps): ChatMessageEdit {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editingUserIdRef = useRef<string | null>(null);
  const editDraftRef = useRef("");
  const editInputRef = useRef<ComposerEditorHandle | null>(null);
  const [editAttachments, setEditAttachments] = useState<ChatAttachmentRef[]>([]);
  const editAttachmentsRef = useRef<ChatAttachmentRef[]>([]);
  editAttachmentsRef.current = editAttachments;

  const clearEditAttachments = () => {
    editAttachmentsRef.current = [];
    setEditAttachments([]);
  };

  function clearUserEdit() {
    editingUserIdRef.current = null;
    editDraftRef.current = "";
    setEditingUserId(null);
    setEditDraft("");
    clearEditAttachments();
  }

  function setEditDraftValue(value: string) {
    editDraftRef.current = value;
    setEditDraft(value);
    // 删除 @file: 芯片即回收对应资产
    const ids = new Set(extractAttachmentIds(value));
    editAttachmentsRef.current = editAttachmentsRef.current.filter((a) => ids.has(a.id));
    setEditAttachments((prev) => prev.filter((a) => ids.has(a.id)));
  }

  /** 点击已发送的用户消息：原位进入编辑，历史不动；发送时才从该条截断。 */
  function beginEditUserMessage(messageId: string) {
    const idx = state.messagesRef.current.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = state.messagesRef.current[idx];
    if (msg.role !== "user") return;
    if (editingUserIdRef.current === messageId) {
      editInputRef.current?.focus();
      return;
    }
    editingUserIdRef.current = messageId;
    setEditingUserId(messageId);
    // 历史图片并入统一资产，并以 @file: 芯片形式回到草稿（沿用原 id/path）
    const images: ChatAttachmentRef[] = Array.isArray(msg.images)
      ? msg.images.map((img) => ({
          id: img.id,
          name: img.id,
          path: img.path,
          mime: img.mime,
          size: 0,
          kind: "image" as const,
        }))
      : [];
    editAttachmentsRef.current = images;
    setEditAttachments(images);
    const imageTokens = images.map((img) => formatFileAttachment(img.id)).join("");
    // @file: 解析已放宽，可紧接前文（无前导空格）成芯片
    const draft = (msg.text ?? "") + imageTokens;
    editDraftRef.current = draft;
    setEditDraft(draft);
    window.requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      el.focus();
      const len = el.getValue().length;
      el.setSelectionRange(len, len);
    });
  }

  function onEditKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      clearUserEdit();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (chatSubmitBlocked(deps.busy, deps.queued)) return;
    const id = editingUserIdRef.current;
    if (!id) return;
    void deps.send(editDraftRef.current, id);
  }

  function sendUserEdit() {
    if (chatSubmitBlocked(deps.busy, deps.queued)) return;
    const id = editingUserIdRef.current;
    if (!id) return;
    void deps.send(editDraftRef.current, id);
  }

  const attachEditFiles = async (files: File[]) => {
    if (!deps.workspaceId) return;
    const refs: ChatAttachmentRef[] = [];
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const ref = await saveAttachment(deps.workspaceId, {
          bytes,
          mime: f.type || "application/octet-stream",
          name: f.name,
        });
        refs.push(ref);
      } catch (err) {
        console.error("attachEditFiles failed", err);
      }
    }
    if (refs.length === 0) return;
    editAttachmentsRef.current = [...editAttachmentsRef.current, ...refs];
    setEditAttachments((prev) => [...prev, ...refs]);
    const insertText = refs.map((r) => formatFileAttachment(r.id)).join("");
    setEditDraftValue(editDraftRef.current + insertText);
  };

  const removeEditAttachment = (id: string) => {
    editAttachmentsRef.current = editAttachmentsRef.current.filter((a) => a.id !== id);
    setEditAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return {
    editingUserId,
    editDraft,
    setEditDraft: setEditDraftValue,
    editInputRef,
    editAttachments,
    editAttachmentsRef,
    attachEditFiles,
    removeEditAttachment,
    clearUserEdit,
    beginEditUserMessage,
    onEditKeyDown,
    sendUserEdit,
  };
}
