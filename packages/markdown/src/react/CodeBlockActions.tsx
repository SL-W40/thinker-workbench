/**
 * 代码块顶栏右侧：⋯ 菜单 → 复制 / 下载。
 * 桌面端走系统「另存为」，确认写入后才提示已下载。
 */
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  /** 代码正文。 */
  value: string;
  /** 语言 id（用于下载扩展名）。 */
  language: string;
};

type SaveTextFileFn = (options: {
  content: string;
  defaultPath?: string;
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}) => Promise<string | null>;

function actionLabels(): {
  more: string;
  copy: string;
  copied: string;
  download: string;
  downloaded: string;
  saveTitle: string;
} {
  const zh =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  return zh
    ? {
        more: "更多",
        copy: "复制",
        copied: "已复制",
        download: "下载",
        downloaded: "已下载",
        saveTitle: "保存代码",
      }
    : {
        more: "More",
        copy: "Copy",
        copied: "Copied",
        download: "Download",
        downloaded: "Downloaded",
        saveTitle: "Save code",
      };
}

/** 语言 → 下载扩展名。 */
function extForLanguage(language: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    tsx: "tsx",
    jsx: "jsx",
    python: "py",
    markdown: "md",
    json: "json",
    css: "css",
    less: "less",
    html: "html",
    xml: "xml",
    yaml: "yml",
    bash: "sh",
    shell: "sh",
    sql: "sql",
    rust: "rs",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    plaintext: "txt",
    text: "txt",
  };
  const key = language.toLowerCase();
  return map[key] ?? (key && key !== "code" ? key : "txt");
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 回退到 execCommand */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 浏览器回退：触发下载（无法获知用户是否确认保存，故不提示成功）。 */
function downloadTextFallback(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getSaveTextFile(): SaveTextFileFn | null {
  const api = (
    window as unknown as {
      thinker?: { settings?: { saveTextFile?: SaveTextFileFn } };
    }
  ).thinker?.settings?.saveTextFile;
  return typeof api === "function" ? api : null;
}

/** 三点菜单：复制代码、下载为文件。 */
export function CodeBlockActions({ value, language }: Props) {
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

  async function onCopy() {
    const ok = await copyText(value);
    if (ok) setToast("copied");
    setOpen(false);
  }

  async function onDownload() {
    setOpen(false);
    const ext = extForLanguage(language);
    const filename = `code.${ext}`;
    const save = getSaveTextFile();
    if (save) {
      // 等用户选定路径并写入成功后再提示
      const saved = await save({
        content: value,
        defaultPath: filename,
        title: labels.saveTitle,
        filters: [
          { name: ext.toUpperCase(), extensions: [ext] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (saved) setToast("downloaded");
      return;
    }
    downloadTextFallback(value, filename);
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
          <button type="button" role="menuitem" className="tw-md-code-menu__item" onClick={() => void onCopy()}>
            {labels.copy}
          </button>
          <button
            type="button"
            role="menuitem"
            className="tw-md-code-menu__item"
            onClick={() => void onDownload()}
          >
            {labels.download}
          </button>
        </div>
      ) : null}
    </div>
  );
}
