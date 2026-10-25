/**
 * 用户附图缩略图条：Composer 草稿与气泡历史共用。
 */
import { CloseIcon, IconButton, Spinner } from "@thinker-workbench/design/react";
import type { ChatImageRef } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { readChatImagePreview } from "../../../platform/ipc/workspaces";
import { useT } from "../../../ui/i18n/useI18n";

export type DraftChatImage = ChatImageRef & {
  /** 本地预览 URL（object URL 或 data URL）。 */
  previewUrl?: string;
  /** 正在落盘。 */
  uploading?: boolean;
};

type Props = {
  images: DraftChatImage[];
  /** 提供时显示移除按钮（草稿态）。 */
  onRemove?: (id: string) => void;
  className?: string;
};

/** 单张缩略图：优先 previewUrl，否则按 path 向主进程要预览。 */
function Thumb({ image, onRemove }: { image: DraftChatImage; onRemove?: (id: string) => void }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(image.previewUrl ?? null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (image.previewUrl) {
      setSrc(image.previewUrl);
      setMissing(false);
      return;
    }
    let cancelled = false;
    void readChatImagePreview(image.path)
      .then((r) => {
        if (cancelled) return;
        if (r?.dataUrl) {
          setSrc(r.dataUrl);
          setMissing(false);
        } else {
          setSrc(null);
          setMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          setMissing(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [image.path, image.previewUrl]);

  const name = image.path.replace(/\\/g, "/").split("/").pop() || image.id;

  return (
    <div className={`chat-image-thumb${image.uploading ? " is-uploading" : ""}`}>
      {src ? (
        <img src={src} alt={name} className="chat-image-thumb__img" />
      ) : missing ? (
        <span className="chat-image-thumb__fallback" title={name}>
          {name}
        </span>
      ) : (
        <span className="chat-image-thumb__loading">
          <Spinner size="sm" />
        </span>
      )}
      {image.uploading ? (
        <span className="chat-image-thumb__spinner" aria-hidden>
          <Spinner size="sm" />
        </span>
      ) : null}
      {onRemove ? (
        <IconButton
          className="chat-image-thumb__remove"
          size="sm"
          variant="ghost"
          aria-label={t("chat.images.remove")}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(image.id);
          }}
        >
          <CloseIcon size="sm" />
        </IconButton>
      ) : null}
    </div>
  );
}

export function ChatImageStrip({ images, onRemove, className }: Props) {
  if (!images.length) return null;
  return (
    <div className={["chat-image-strip", className].filter(Boolean).join(" ")}>
      {images.map((img) => (
        <Thumb key={img.id} image={img} onRemove={onRemove} />
      ))}
    </div>
  );
}
