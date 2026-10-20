/**
 * @ 文件芯片悬停预览卡片。
 *
 * 通过 document 事件委托捕获 `[data-mention="at"]`（composer 与消息气泡共用），
 * 按 `data-path` 区分工作空间路径与外部附件（`file:<id>`），经 bridge 拉取预览：
 * - 图片：缩略图 + 尺寸 + 大小 + MIME
 * - 文档/文本：解析文本预览 + 文件信息
 * - 二进制/超限：仅文件信息
 * 卡片用 portal 渲染在 body，定位贴近芯片；进出卡片有隐藏延时，支持点击「打开」。
 */

import { Spinner } from "@thinker-workbench/design/react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { workspaceReadFile } from "../../bridge/workspaceFs";
import { parseWorkspaceFileText, readAttachment } from "../../bridge/workspaces";
import { useT } from "../../i18n/useI18n";
import { formatFileSize, summarizeTextPreview } from "./mentionPreviewFormat";
import "./MentionChipPreview.less";

export { formatFileSize, summarizeTextPreview };

export type MentionChipPreviewProps = {
  workspaceId: string | null;
  /** 点击「在检视器中打开」（仅工作空间文件）。 */
  onOpenFile?: (path: string) => void;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

type FileInfo = { name: string; path: string; size: number; mime: string; ext: string };
type PreviewReady = {
  status: "ready";
  info: FileInfo;
  imageUrl?: string;
  text?: string;
  isExternal: boolean;
};
type PreviewState =
  | { status: "loading" }
  | { status: "missing"; name?: string; path: string }
  | PreviewReady;

async function resolve(key: string, workspaceId: string | null): Promise<PreviewState> {
  if (!workspaceId) return { status: "missing", path: key };
  if (key.startsWith("file:")) {
    const id = key.slice("file:".length);
    const att = await readAttachment(workspaceId, id);
    if (!att) return { status: "missing", path: key };
    const info: FileInfo = {
      name: att.name,
      path: "external",
      size: att.size,
      mime: att.mime,
      ext: extOf(att.name),
    };
    if (att.dataUrl) return { status: "ready", info, imageUrl: att.dataUrl, isExternal: true };
    return { status: "ready", info, text: att.text ?? undefined, isExternal: true };
  }
  const wf = await workspaceReadFile(workspaceId, key);
  const name = key.split("/").pop() || key;
  if (wf.missing) return { status: "missing", name, path: key };
  const info: FileInfo = {
    name,
    path: key,
    size: wf.size,
    mime: wf.mimeType ?? "",
    ext: extOf(key),
  };
  if (wf.mediaKind === "image" && wf.previewDataUrl) {
    return { status: "ready", info, imageUrl: wf.previewDataUrl, isExternal: false };
  }
  if (!wf.binary && typeof wf.content === "string" && wf.content.length > 0) {
    return { status: "ready", info, text: wf.content, isExternal: false };
  }
  const parsed = await parseWorkspaceFileText(workspaceId, key);
  return { status: "ready", info, text: parsed?.text ?? undefined, isExternal: false };
}

export function MentionChipPreview({ workspaceId, onOpenFile }: MentionChipPreviewProps) {
  const t = useT();
  const [active, setActive] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [view, setView] = useState<PreviewState | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const cacheRef = useRef<Map<string, PreviewState>>(new Map());
  const hideTimer = useRef<number | undefined>(undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef(workspaceId);
  const openRef = useRef(onOpenFile);
  wsRef.current = workspaceId;
  openRef.current = onOpenFile;

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setActive(null), 180);
  }, [cancelHide]);

  // 全局委托：零侵入捕获任意 @ 芯片（composer 与气泡）
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      const el = e.target as Element | null;
      const chip = el?.closest?.('[data-mention="at"]') as HTMLElement | null;
      if (chip?.dataset.path) {
        cancelHide();
        const k = chip.dataset.path;
        setActive((prev) =>
          prev && prev.key === k ? prev : { key: k, rect: chip.getBoundingClientRect() },
        );
        return;
      }
      scheduleHide();
    };
    const onOut = (e: PointerEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest?.('[data-mention="at"]')) return;
      scheduleHide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      cancelHide();
    };
  }, [cancelHide, scheduleHide]);

  // 按 key 拉取预览（带缓存 + 取消竞态）
  useEffect(() => {
    if (!active) {
      setView(null);
      return;
    }
    const key = active.key;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setView(cached);
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    resolve(key, wsRef.current)
      .then((res) => {
        if (cancelled) return;
        cacheRef.current.set(key, res);
        setView(res);
      })
      .catch(() => {
        if (cancelled) return;
        const miss: PreviewState = { status: "missing", path: key };
        cacheRef.current.set(key, miss);
        setView(miss);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  // 图片尺寸（用于展示 W×H）
  useEffect(() => {
    if (view?.status === "ready" && view.imageUrl) {
      const img = new Image();
      img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = view.imageUrl;
    } else {
      setDims(null);
    }
  }, [view]);

  // 贴近芯片定位，水平夹取视口
  const [style, setStyle] = useState<CSSProperties>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: view/dims 未直接引用，但卡片尺寸随预览内容（图片/文本）变化，需重算定位
  useLayoutEffect(() => {
    if (!active || !cardRef.current) return;
    const rect = active.rect;
    const cardW = cardRef.current.offsetWidth || 320;
    const cardH = cardRef.current.offsetHeight || 160;
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - cardW - margin);
    let top = rect.top - cardH - margin;
    if (top < margin) top = rect.bottom + margin;
    setStyle({ left, top, width: cardW });
  }, [active, view, dims]);

  if (!active) return null;

  const card = (
    <div
      ref={cardRef}
      className="mention-preview"
      style={style}
      role="tooltip"
      onPointerEnter={cancelHide}
      onPointerLeave={scheduleHide}
    >
      {view?.status === "loading" && (
        <div className="mention-preview__loading">
          <Spinner size="sm" />
        </div>
      )}
      {view?.status === "missing" && (
        <div className="mention-preview__missing">{t("chat.mention.preview.missing")}</div>
      )}
      {view?.status === "ready" && (
        <>
          {view.imageUrl && (
            <img className="mention-preview__media" src={view.imageUrl} alt={view.info.name} />
          )}
          <div className="mention-preview__info">
            <div className="mention-preview__name" title={view.info.name}>
              {view.info.name}
            </div>
            <div className="mention-preview__meta">
              {formatFileSize(view.info.size)}
              {dims ? ` · ${dims.w}×${dims.h}` : ""}
              {view.info.mime ? ` · ${view.info.mime}` : ""}
            </div>
            <div className="mention-preview__path" title={view.info.path}>
              {view.isExternal ? t("chat.mention.preview.external") : view.info.path}
            </div>
          </div>
          {view.text ? (
            <pre className="mention-preview__text">{summarizeTextPreview(view.text, 2000, 24)}</pre>
          ) : view.imageUrl ? null : (
            <div className="mention-preview__hint">{t("chat.mention.preview.parseFailed")}</div>
          )}
          {!view.isExternal && openRef.current && (
            <button
              type="button"
              className="mention-preview__open"
              onClick={() => openRef.current?.(view.info.path)}
            >
              {t("chat.mention.preview.open")}
            </button>
          )}
        </>
      )}
    </div>
  );
  return createPortal(card, document.body);
}
