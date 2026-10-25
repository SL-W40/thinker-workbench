/**
 * Markdown 文件查看器：头部右侧竖排三点菜单，可切换「编辑 / 预览」。
 * 编辑复用 Monaco FileEditor；预览复用共享 MarkdownView。
 */

import { useDesignTheme } from "@thinker-workbench/design/react";
import { MarkdownView } from "@thinker-workbench/markdown/react";
import { useEffect, useRef, useState } from "react";
import { isBrowserableUrl, requestOpenBrowser } from "../../platform/ipc/browser";
import { useT } from "../../ui/i18n/useI18n";
import { MoreVerticalIcon } from "../../ui/icons";
import { FileEditor, type FileEditorProps } from "./FileEditor";
import {
  loadMarkdownViewMode,
  type MarkdownViewMode,
  saveMarkdownViewMode,
} from "./markdownViewMode";

type MarkdownFileViewProps = FileEditorProps & {
  /** 在编辑器内打开文件（相对链接用）。 */
  onOpenFile: (path: string) => void;
};

/** 把 markdown 内的链接解析为文件路径；非文件类（网页/mailto 等）返回 null。 */
function resolveDocLink(href: string, mdPath?: string | null): string | null {
  const hashIdx = href.indexOf("#");
  const clean = (hashIdx >= 0 ? href.slice(0, hashIdx) : href).trim();
  if (!clean) return null;
  if (/^(https?:|mailto:|tel:|ftp:)/i.test(clean)) return null;
  if (/^file:\/\//i.test(clean)) {
    return decodeURIComponent(clean.slice(clean.indexOf("://") + 3)).replace(/\\/g, "/");
  }
  if (/^([a-zA-Z]:[\\/]|\/)/.test(clean)) {
    return clean.replace(/\\/g, "/");
  }
  if (!mdPath) return null;
  const dir = mdPath.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
  const parts = `${dir}/${clean}`.split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

export function MarkdownFileView(props: MarkdownFileViewProps) {
  const { value, path, modelPath, readOnly, onChange, onSave, onOpenFile } = props;
  const t = useT();
  const [mode, setMode] = useState<MarkdownViewMode>(() => loadMarkdownViewMode());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const { markdownTheme } = useDesignTheme();

  // 点击外部或按 Esc 关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const name = path?.replace(/\\/g, "/").split("/").pop() ?? "";

  return (
    <div className="md-fileview">
      <div className="md-fileview__header">
        <span className="md-fileview__name" title={path ?? ""}>
          {name}
        </span>
        <div className="md-fileview__menu-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className="md-fileview__kebab"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("inspector.files.moreActions")}
            title={t("inspector.files.moreActions")}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVerticalIcon />
          </button>
          {menuOpen ? (
            <div className="md-fileview__menu" role="menu">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={mode === "preview"}
                className={`md-fileview__menu-item${mode === "preview" ? " is-active" : ""}`}
                onClick={() => {
                  setMode("preview");
                  saveMarkdownViewMode("preview");
                  setMenuOpen(false);
                }}
              >
                {t("inspector.files.preview")}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={mode === "edit"}
                className={`md-fileview__menu-item${mode === "edit" ? " is-active" : ""}`}
                onClick={() => {
                  setMode("edit");
                  saveMarkdownViewMode("edit");
                  setMenuOpen(false);
                }}
              >
                {t("inspector.files.edit")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="md-fileview__body">
        {mode === "edit" ? (
          <FileEditor
            value={value}
            path={path}
            modelPath={modelPath}
            readOnly={readOnly}
            onChange={onChange}
            onSave={onSave}
          />
        ) : (
          <div className="md-fileview__preview tw-md">
            <MarkdownView
              markdown={value}
              theme={markdownTheme}
              streaming={false}
              onLinkClick={(href) => {
                if (isBrowserableUrl(href)) {
                  requestOpenBrowser(href);
                  return true;
                }
                // 页内锚点：当前预览不支持跳转，吞掉避免默认导航
                if (href.startsWith("#")) return true;
                // 文件链接：解析为绝对路径后在编辑器打开
                const target = resolveDocLink(href, path);
                if (target) {
                  onOpenFile(target);
                  return true;
                }
                return false;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
