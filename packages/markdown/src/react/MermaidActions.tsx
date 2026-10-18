/**
 * Mermaid 顶栏：缩放控件 + ⋯ 菜单（复制源码/SVG、保存 PNG/SVG）。
 */
import { useEffect, useId, useRef, useState } from "react";
import { downloadBlob, svgToPngBlob } from "../mermaid/svgExport";
import { clampMermaidZoom, stepMermaidZoom } from "./MermaidViewport";
import { copyText, saveOrDownloadText } from "./textExport";

type Props = {
  /** Mermaid 源文本。 */
  source: string;
  /** 当前渲染 SVG；为空时禁用图片相关操作。 */
  svg: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

function actionLabels(): {
  more: string;
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  copySource: string;
  copySvg: string;
  savePng: string;
  saveSvg: string;
  copied: string;
  downloaded: string;
  saveSvgTitle: string;
} {
  const zh =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  return zh
    ? {
        more: "更多",
        zoomIn: "放大",
        zoomOut: "缩小",
        zoomReset: "重置缩放",
        copySource: "复制源码",
        copySvg: "复制 SVG",
        savePng: "保存为 PNG",
        saveSvg: "保存为 SVG",
        copied: "已复制",
        downloaded: "已下载",
        saveSvgTitle: "保存 Mermaid SVG",
      }
    : {
        more: "More",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        zoomReset: "Reset zoom",
        copySource: "Copy source",
        copySvg: "Copy SVG",
        savePng: "Save PNG",
        saveSvg: "Save SVG",
        copied: "Copied",
        downloaded: "Downloaded",
        saveSvgTitle: "Save Mermaid SVG",
      };
}

export function MermaidActions({ source, svg, zoom, onZoomChange }: Props) {
  const labels = actionLabels();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<"copied" | "downloaded" | null>(null);
  const hasSvg = Boolean(svg.trim());

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function onCopySource() {
    const ok = await copyText(source);
    if (ok) setToast("copied");
    setOpen(false);
  }

  async function onCopySvg() {
    if (!hasSvg) return;
    const ok = await copyText(svg);
    if (ok) setToast("copied");
    setOpen(false);
  }

  async function onSaveSvg() {
    setOpen(false);
    if (!hasSvg) return;
    const result = await saveOrDownloadText({
      content: svg,
      filename: "diagram.svg",
      title: labels.saveSvgTitle,
      filters: [
        { name: "SVG", extensions: ["svg"] },
        { name: "All Files", extensions: ["*"] },
      ],
      mime: "image/svg+xml;charset=utf-8",
    });
    if (result === "saved") setToast("downloaded");
  }

  async function onSavePng() {
    setOpen(false);
    if (!hasSvg) return;
    try {
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob(blob, "diagram.png");
      setToast("downloaded");
    } catch {
      /* 忽略导出失败 */
    }
  }

  const pct = `${Math.round(zoom * 100)}%`;

  return (
    <div className="tw-md-code-actions tw-md-mermaid-actions" ref={rootRef}>
      {toast ? (
        <span className="tw-md-code-toast" role="status" aria-live="polite">
          {toast === "copied" ? labels.copied : labels.downloaded}
        </span>
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: 缩放工具条用 div + role="group" 聚合按钮，无可对应原生控件 */}
      <div className="tw-md-mermaid-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="tw-md-mermaid-zoom__btn"
          aria-label={labels.zoomOut}
          onClick={() => onZoomChange(stepMermaidZoom(zoom, -1))}
        >
          −
        </button>
        <button
          type="button"
          className="tw-md-mermaid-zoom__pct"
          aria-label={labels.zoomReset}
          title={labels.zoomReset}
          onClick={() => onZoomChange(clampMermaidZoom(1))}
        >
          {pct}
        </button>
        <button
          type="button"
          className="tw-md-mermaid-zoom__btn"
          aria-label={labels.zoomIn}
          onClick={() => onZoomChange(stepMermaidZoom(zoom, 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={`tw-md-code-more${open ? " is-open" : ""}`}
        aria-label={labels.more}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tw-md-code-more__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open ? (
        <div className="tw-md-code-menu" id={menuId} role="menu" aria-label={labels.more}>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            onClick={() => void onCopySource()}
          >
            {labels.copySource}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            disabled={!hasSvg}
            onClick={() => void onCopySvg()}
          >
            {labels.copySvg}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            disabled={!hasSvg}
            onClick={() => void onSavePng()}
          >
            {labels.savePng}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            disabled={!hasSvg}
            onClick={() => void onSaveSvg()}
          >
            {labels.saveSvg}
          </button>
        </div>
      ) : null}
    </div>
  );
}
