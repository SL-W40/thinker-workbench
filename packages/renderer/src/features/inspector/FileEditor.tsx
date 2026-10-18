/**
 * Monaco 文件编辑器；⌘S / Ctrl+S 保存；主题色跟随设计体系。
 * 未保存状态由 inspector tab 展示，不在编辑器底部重复。
 */
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useDesignTheme } from "@thinker-workbench/design/react";
import { useEffect, useRef, useState } from "react";
import "./monacoSetup";
import { applyMonacoTheme, readMonacoFontFamily, TW_MONACO_THEME } from "./monacoTheme";

export type FileEditorProps = {
  value: string;
  path?: string | null;
  /** Monaco 模型 URI；未命名缓冲用唯一 key，避免多 tab 共用同一 model。 */
  modelPath?: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  /** ⌘S / Ctrl+S 触发；Monaco 默认吞键，需显式绑定。 */
  onSave?: () => void;
};

function langFromPath(path?: string | null) {
  if (!path) return "plaintext";
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const ext = base.includes(".") ? (base.split(".").pop()?.toLowerCase() ?? "") : "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    cjs: "javascript",
    mjs: "javascript",
    json: "json",
    jsonc: "json",
    md: "markdown",
    mdx: "markdown",
    py: "python",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    toml: "ini",
    ini: "ini",
    conf: "ini",
    dockerfile: "dockerfile",
  };
  if (!ext && base.toLowerCase() === "dockerfile") return "dockerfile";
  return map[ext] ?? "plaintext";
}

/**
 * 把工作区绝对路径转成 Monaco 可识别的 URI 字符串。
 * Windows `C:\...` 若直接当 path，会被当成 scheme=`C`，TS 语言服务挂不上。
 */
function toMonacoModelPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "inmemory:///untitled";
  if (/^(inmemory|file|untitled):/i.test(trimmed)) return trimmed;
  // Windows 盘符路径
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, "/");
    return `file:///${normalized}`;
  }
  // POSIX 绝对路径
  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }
  return trimmed;
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
  onChange,
  onSave,
}: FileEditorProps) {
  const { theme } = useDesignTheme();
  const colorScheme = theme.colorScheme === "dark" ? "dark" : "light";
  const lang = language ?? langFromPath(path ?? modelPath);
  const monacoPath = toMonacoModelPath(path || modelPath || "inmemory:///untitled");

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
  }, [colorScheme]);

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
    // Ctrl+Space 显式触发补全
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      void editor.getAction("editor.action.triggerSuggest")?.run();
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
            // 语法提示：补全 / 参数提示 / 悬停说明 / 波浪线
            quickSuggestions: { other: true, comments: false, strings: true },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnCommitCharacter: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            wordBasedSuggestions: "currentDocument",
            parameterHints: { enabled: true },
            hover: { enabled: true, delay: 300 },
            renderValidationDecorations: readOnly ? "off" : "on",
            wordWrap: "on",
            automaticLayout: true,
            // 补全 / 悬停用 fixed，避免被右侧面板 overflow:hidden 裁切
            fixedOverflowWidgets: true,
            padding: { top: 12 },
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              // 与全局细滚动条（--scrollbar-size: 7px）对齐；否则编辑区比
              // 预览区多占 7px，切换「编辑 / 预览」时内容宽度会跳变
              verticalScrollbarSize: 7,
              horizontalScrollbarSize: 7,
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
          onChange={(v: string | undefined) => onChange?.(v ?? "")}
        />
      </div>
    </div>
  );
}
