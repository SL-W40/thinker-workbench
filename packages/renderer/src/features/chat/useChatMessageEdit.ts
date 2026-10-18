/**
 * 用户消息原位编辑：editingUserId / editDraft / beginEditUserMessage / sendUserEdit / onEditKeyDown。
 *
 * 编辑期只动草稿与附图，历史不动；发送时才由 send(replaceUserId) 从该条截断重发。
 * 原位附图与底部草稿附图共用上传通道，但状态独立（发送前不写回历史）。
 */

import { useRef, useState } from "react";
import type { DraftChatImage } from "./ChatImageStrip";
import type { ComposerEditorHandle } from "./ComposerEditor";
import { chatSubmitBlocked } from "./chatSubmit";
import type { ChatRunState } from "./useChatRunState";

/** 编辑 Hook 需要的外部能力（由编排核心注入）。 */
export type ChatEditDeps = {
  /** 发送；原位重发走 send(text, replaceUserId)。 */
  send: (override?: string, replaceUserId?: string | null) => Promise<void>;
  busy: boolean;
  queued: boolean;
  /** 图片上传通道（草稿 / 编辑共用）。 */
  attachImageFilesTo: (
    files: File[],
    setImages: (updater: (prev: DraftChatImage[]) => DraftChatImage[]) => void,
  ) => Promise<void>;
};

export type ChatMessageEdit = {
  /** 正在原位编辑的用户消息；未发送前不改历史。 */
  editingUserId: string | null;
  editDraft: string;
  setEditDraft: (value: string) => void;
  editInputRef: React.RefObject<ComposerEditorHandle | null>;
  /** 原位编辑中的附图（可增删，发送前不写回历史）。 */
  editImages: DraftChatImage[];
  editImagesRef: React.RefObject<DraftChatImage[]>;
  attachEditImageFiles: (files: File[]) => Promise<void>;
  removeEditImage: (id: string) => void;
  /** 退出编辑并清空草稿 / 附图。 */
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
  const [editImages, setEditImages] = useState<DraftChatImage[]>([]);
  const editImagesRef = useRef<DraftChatImage[]>([]);
  editImagesRef.current = editImages;

  const clearEditImages = () => {
    for (const img of editImagesRef.current) {
      if (img.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl);
    }
    editImagesRef.current = [];
    setEditImages([]);
  };

  function clearUserEdit() {
    editingUserIdRef.current = null;
    editDraftRef.current = "";
    setEditingUserId(null);
    setEditDraft("");
    clearEditImages();
  }

  function setEditDraftValue(value: string) {
    editDraftRef.current = value;
    setEditDraft(value);
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
    const text = msg.text ?? "";
    editDraftRef.current = text;
    setEditDraft(text);
    clearEditImages();
    const images = Array.isArray(msg.images) ? msg.images.map((img) => ({ ...img })) : [];
    editImagesRef.current = images;
    setEditImages(images);
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

  const attachEditImageFiles = (files: File[]) => deps.attachImageFilesTo(files, setEditImages);

  const removeEditImage = (id: string) => {
    setEditImages((prev) => {
      const hit = prev.find((img) => img.id === id);
      if (hit?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  return {
    editingUserId,
    editDraft,
    setEditDraft: setEditDraftValue,
    editInputRef,
    editImages,
    editImagesRef,
    attachEditImageFiles,
    removeEditImage,
    clearUserEdit,
    beginEditUserMessage,
    onEditKeyDown,
    sendUserEdit,
  };
}
