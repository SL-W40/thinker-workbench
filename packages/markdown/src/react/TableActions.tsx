/**
 * 表格顶栏右侧：⋯ 菜单 → 复制 Markdown/TSV、下载 CSV/Markdown。
 */
import { useEffect, useId, useRef, useState } from "react";
import { type TableAlign, tableToCsv, tableToMarkdown, tableToTsv } from "../table/serialize";
import type { InlineNode } from "../types";
import { copyText, saveOrDownloadText } from "./textExport";

type Props = {
  headers: InlineNode[][];
  aligns: TableAlign[];
  rows: InlineNode[][][];
};

function actionLabels(): {
  more: string;
  copyMd: string;
  copyTsv: string;
  downloadCsv: string;
  downloadMd: string;
  copied: string;
  downloaded: string;
  saveCsvTitle: string;
  saveMdTitle: string;
} {
  const zh =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  return zh
    ? {
        more: "更多",
        copyMd: "复制 Markdown",
        copyTsv: "复制 TSV",
        downloadCsv: "下载 CSV",
        downloadMd: "下载 Markdown",
        copied: "已复制",
        downloaded: "已下载",
        saveCsvTitle: "导出表格 CSV",
        saveMdTitle: "导出表格 Markdown",
      }
    : {
        more: "More",
        copyMd: "Copy Markdown",
        copyTsv: "Copy TSV",
        downloadCsv: "Download CSV",
        downloadMd: "Download Markdown",
        copied: "Copied",
        downloaded: "Downloaded",
        saveCsvTitle: "Export table CSV",
        saveMdTitle: "Export table Markdown",
      };
}

/** 三点菜单：复制 Markdown / TSV，下载 CSV / Markdown。 */
export function TableActions({ headers, aligns, rows }: Props) {
  const labels = actionLabels();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<"copied" | "downloaded" | null>(null);

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

  async function onCopyMd() {
    const ok = await copyText(tableToMarkdown(headers, aligns, rows));
    if (ok) setToast("copied");
    setOpen(false);
  }

  async function onCopyTsv() {
    const ok = await copyText(tableToTsv(headers, rows));
    if (ok) setToast("copied");
    setOpen(false);
  }

  async function onDownloadCsv() {
    setOpen(false);
    const result = await saveOrDownloadText({
      content: tableToCsv(headers, rows),
      filename: "table.csv",
      title: labels.saveCsvTitle,
      filters: [
        { name: "CSV", extensions: ["csv"] },
        { name: "All Files", extensions: ["*"] },
      ],
      mime: "text/csv;charset=utf-8",
    });
    if (result === "saved") setToast("downloaded");
  }

  async function onDownloadMd() {
    setOpen(false);
    const result = await saveOrDownloadText({
      content: `${tableToMarkdown(headers, aligns, rows)}\n`,
      filename: "table.md",
      title: labels.saveMdTitle,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All Files", extensions: ["*"] },
      ],
      mime: "text/markdown;charset=utf-8",
    });
    if (result === "saved") setToast("downloaded");
  }

  return (
    <div className="tw-md-code-actions" ref={rootRef}>
      {toast ? (
        <span className="tw-md-code-toast" role="status" aria-live="polite">
          {toast === "copied" ? labels.copied : labels.downloaded}
        </span>
      ) : null}
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
            onClick={() => void onCopyMd()}
          >
            {labels.copyMd}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            onClick={() => void onCopyTsv()}
          >
            {labels.copyTsv}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            onClick={() => void onDownloadCsv()}
          >
            {labels.downloadCsv}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            onClick={() => void onDownloadMd()}
          >
            {labels.downloadMd}
          </button>
        </div>
      ) : null}
    </div>
  );
}
