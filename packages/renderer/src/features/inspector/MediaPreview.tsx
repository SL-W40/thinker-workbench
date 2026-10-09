/**
 * 工作空间媒体预览：图片 / 音视频；过大或非媒体二进制用 EmptyState。
 */
import { EmptyState } from "@thinker-workbench/design/react";
import type { WorkspaceMediaKind } from "@thinker-workbench/shared";
import { useT } from "../../i18n/I18nProvider";

export type MediaPreviewInfo = {
  kind: WorkspaceMediaKind | "binary";
  mimeType?: string | null;
  previewDataUrl?: string | null;
  size: number;
};

type Props = {
  path: string;
  info: MediaPreviewInfo;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreview({ path, info }: Props) {
  const t = useT();
  const canPreview =
    info.kind !== "binary" && typeof info.previewDataUrl === "string" && info.previewDataUrl.length > 0;

  return (
    <div className="editor-wrap media-preview">
      <div className="media-preview__body">
        {canPreview && info.kind === "image" ? (
          <img
            className="media-preview__image"
            src={info.previewDataUrl!}
            alt={path}
            draggable={false}
          />
        ) : null}
        {canPreview && info.kind === "audio" ? (
          <audio className="media-preview__audio" src={info.previewDataUrl!} controls preload="metadata" />
        ) : null}
        {canPreview && info.kind === "video" ? (
          <video
            className="media-preview__video"
            src={info.previewDataUrl!}
            controls
            preload="metadata"
          />
        ) : null}
        {!canPreview ? (
          <EmptyState
            title={
              info.kind === "binary"
                ? t("inspector.files.binaryUnsupported")
                : t("inspector.files.mediaTooLarge")
            }
            description={
              info.kind === "binary"
                ? t("inspector.files.binaryUnsupportedHint")
                : t("inspector.files.mediaTooLargeHint", { size: formatBytes(info.size) })
            }
          />
        ) : null}
      </div>

      <div className="statusline">
        <span className="statusline-path" title={path}>
          {path}
        </span>
        <span className="statusline-meta">
          <span>
            {info.kind === "image"
              ? t("inspector.files.mediaKindImage")
              : info.kind === "audio"
                ? t("inspector.files.mediaKindAudio")
                : info.kind === "video"
                  ? t("inspector.files.mediaKindVideo")
                  : t("inspector.files.readOnly")}
          </span>
          {info.mimeType ? <span>{info.mimeType}</span> : null}
          <span>{formatBytes(info.size)}</span>
        </span>
      </div>
    </div>
  );
}
