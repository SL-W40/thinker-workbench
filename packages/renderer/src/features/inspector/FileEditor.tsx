/**
 * Monaco 文件编辑器：脏状态 pill + Ctrl/Cmd+S；主题色跟随设计体系。
 */
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useDesignTheme } from "@thinker-workbench/design/react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/I18nProvider";
import "./monacoSetup";
import {
  applyMonacoTheme,
  readMonacoFontFamily,
  TW_MONACO_THEME,
} from "./monacoTheme";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl+";

export type FileEditorProps = {
  value: string;
  path?: string | null;
  /** Monaco 模型 URI；未命名缓冲用唯一 key，避免多 tab 共用同一 model。 */
  modelPath?: string;
  language?: string;
  readOnly?: boolean;
  /** 未保存编辑 — 以 statusline pill 展示，而非 Save 按钮。 */
  dirty?: boolean;
  onChange?: (value: string) => void;
  /** ⌘S / Ctrl+S 触发；Monaco 默认吞键，需显式绑定。 */
  onSave?: () => void;
};

function langFromPath(path?: string | null) {
  if (!path) return "plaintext";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    cjs: "javascript",
    mjs: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    css: "css",
    less: "less",
    html: "html",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

function readCssPx(name: string): number | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function FileEditor({
  value,
  path,
  modelPath,
  language,
  readOnly,
  dirty,
  onChange,
  onSave,
}: FileEditorProps) {
  const t = useT();
  const { theme, themeId } = useDesignTheme();
  const colorScheme = theme.colorScheme === "dark" ? "dark" : "light";
  const lang = language ?? langFromPath(path);
  const monacoPath = path || modelPath || "inmemory:///untitled";

  const [type, setType] = useState(() => ({
    fontSize: 13,
    fontFamily: readMonacoFontFamily(),
  }));

  // 主题切换时重读字号 / 等宽栈，并重刷 Monaco 色板
  useEffect(() => {
    setType({
      fontSize: readCssPx("--tk-editor-font-size") ?? 13,
      fontFamily: readMonacoFontFamily(),
    });
    void loader.init().then((monaco) => {
      applyMonacoTheme(monaco, colorScheme);
    });
  }, [themeId, colorScheme]);

  // 按键绑定在 mount 时注册一次，经 ref 指向最新 onSave，避免闭包过期。
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const handleMount: OnMount = (editor, monaco) => {
    applyMonacoTheme(monaco, colorScheme);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.();
    });
  };

  return (
    <div className="editor-wrap">
      <div className="editor-wrap__monaco">
        <Editor
          height="100%"
          theme={TW_MONACO_THEME}
          language={lang}
          value={value}
          path={monacoPath}
          onMount={handleMount}
          loading={<div className="editor-wrap__loading" aria-busy="true" />}
          options={{
            readOnly: !!readOnly,
            contextmenu: false,
            fontFamily: type.fontFamily,
            fontSize: type.fontSize,
            fontLigatures: false,
            // 当前行高亮含 gutter，与编辑区通栏同色
            renderLineHighlight: "all",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            hover: { enabled: "off" },
            renderValidationDecorations: "off",
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 12 },
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
              arrowSize: 0,
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              verticalSliderSize: 6,
              horizontalSliderSize: 6,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
          }}
          onChange={(v) => onChange?.(v ?? "")}
        />
      </div>
      <div className="statusline">
        <span className="statusline-path" title={path ?? undefined}>
          {path ?? t("inspector.files.untitled")}
        </span>
        <span className="statusline-meta">
          {dirty ? <em className="statusline-dirty">{t("inspector.files.dirty")}</em> : null}
          <span className="statusline-kbd" title={t("inspector.files.saveHint", { key: `${modKey}S` })}>
            {modKey}S
          </span>
          <span>{lang}</span>
        </span>
      </div>
    </div>
  );
}
