/**
 * 聊天草稿附图：选择 / 粘贴 / 拖入图片的落盘与占位管理。
 * 草稿输入框与原位编辑共用 attachImageFilesTo（传入目标图片列表的 setter 即可）。
 */
import { createId } from "@thinker-workbench/shared";
import { useCallback, useRef, useState } from "react";
import { getLastWorkspaceId, listWorkspaces, saveChatImage } from "../../bridge/workspaces";
import { useT } from "../../i18n/useI18n";
import { appLog } from "../../log/sessionLog";
import type { DraftChatImage } from "./ChatImageStrip";

/** 发送前缺少工作空间时的门禁（显示在输入框上方）。 */
export type WorkspaceGate = {
  kind: "no-workspace" | "need-session";
  message: string;
} | null;

/** 附加图片所需的上下文：工作空间归属与门禁提示。 */
type AttachDeps = {
  /** 当前工作空间 id；缺省时回退最近使用的工作空间。 */
  workspaceId: string | null;
  /** 无可用工作空间时设置门禁。 */
  setWorkspaceGate: (gate: WorkspaceGate) => void;
};

/**
 * 草稿附图状态与操作。
 * draftImagesRef 供 send 读取最新列表（避免闭包过期）。
 */
export function useDraftImages({ workspaceId, setWorkspaceGate }: AttachDeps) {
  const t = useT();
  const [draftImages, setDraftImages] = useState<DraftChatImage[]>([]);
  const draftImagesRef = useRef<DraftChatImage[]>([]);
  draftImagesRef.current = draftImages;

  /** 清除草稿附图并 revoke object URL。 */
  const clearDraftImages = useCallback(() => {
    for (const img of draftImagesRef.current) {
      if (img.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl);
    }
    draftImagesRef.current = [];
    setDraftImages([]);
  }, []);

  /** 选择 / 粘贴 / 拖入图片：立刻落盘。草稿与原位编辑共用。 */
  const attachImageFilesTo = useCallback(
    async (
      files: File[],
      setImages: (updater: (prev: DraftChatImage[]) => DraftChatImage[]) => void,
    ) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      let wid = workspaceId ?? (await getLastWorkspaceId());
      if (!wid) {
        const workspaces = await listWorkspaces();
        wid = workspaces[0]?.id ?? null;
      }
      if (!wid) {
        setWorkspaceGate({ kind: "no-workspace", message: t("chat.noWorkspace") });
        return;
      }

      for (const file of imageFiles) {
        const tempId = createId("img");
        const previewUrl = URL.createObjectURL(file);
        const placeholder: DraftChatImage = {
          id: tempId,
          path: "",
          mime: file.type || "image/png",
          width: 0,
          height: 0,
          previewUrl,
          uploading: true,
        };
        setImages((prev) => [...prev, placeholder]);
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          const saved = await saveChatImage(wid, {
            bytes: buf,
            mime: file.type || "image/png",
            name: file.name,
          });
          setImages((prev) =>
            prev.map((img) =>
              img.id === tempId ? { ...saved, previewUrl, uploading: false } : img,
            ),
          );
        } catch (err) {
          URL.revokeObjectURL(previewUrl);
          setImages((prev) => prev.filter((img) => img.id !== tempId));
          appLog("chat.images").warn("save failed", {
            meta: {
              error: err instanceof Error ? err.message : String(err),
              name: file.name,
            },
          });
        }
      }
    },
    [workspaceId, t, setWorkspaceGate],
  );

  const attachImageFiles = useCallback(
    (files: File[]) => attachImageFilesTo(files, setDraftImages),
    [attachImageFilesTo],
  );

  const removeDraftImage = useCallback((id: string) => {
    setDraftImages((prev) => {
      const hit = prev.find((img) => img.id === id);
      if (hit?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  return {
    draftImages,
    setDraftImages,
    draftImagesRef,
    clearDraftImages,
    attachImageFilesTo,
    attachImageFiles,
    removeDraftImage,
  };
}
