/**
 * Notes 创意主题——暖色笔记纸面 + 墨色。
 */
import type { MarkdownTheme } from "./types";

/** 拉丁系统手写体 + 自托管中文站酷快乐体。 */
const HAND = '"Segoe Print", "Bradley Hand", "Apple Chancery", "TW Hand", cursive';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

/** Notes——暖色笔记纸面 + 墨色。 */
export const notesTheme: MarkdownTheme = {
  id: "notes",
  vars: {
    "--md-fg": "#2a2218",
    "--md-fg-muted": "#6b5344",
    "--md-bg": "transparent",
    "--md-accent": "#6b5344",
    "--md-border": "rgba(90, 70, 50, 0.18)",
    "--md-panel": "#f7efe3",
    "--md-code-bg": "#efe2cc",
    "--md-code-fg": "#2a2218",
    /* 与聊天 FileDiff 同为纸面代码块（浅底 + 墨色语法） */
    "--md-pre-bg": "#f7efe3",
    "--md-pre-fg": "#2a2218",
    "--md-blockquote-bg": "rgba(107, 83, 68, 0.08)",
    "--md-table-head": "rgba(90, 70, 50, 0.06)",
    "--md-danger": "#9b3b2e",
    "--md-danger-bg": "rgba(155, 59, 46, 0.08)",
    "--md-shadow-soft": "rgba(90, 70, 50, 0.06)",
    "--md-stream-glow": "rgba(196, 165, 116, 0.28)",
    "--md-font-mono": MONO,
    "--md-font-hand": HAND,
    "--md-hl-keyword": "#5c4033",
    "--md-hl-string": "#1a7f37",
    "--md-hl-number": "#9b3b2e",
    "--md-hl-comment": "#6b5344",
    "--md-hl-title": "#2a2218",
    "--md-hl-attr": "#3d2e22",
    "--md-hl-built-in": "#3d6b4f",
    "--md-hl-literal": "#5c4033",
    "--md-hl-type": "#5c4033",
    "--md-hl-meta": "#6b5344",
    "--md-mermaid-dark": "false",
    "--md-mermaid-paper": "#f4ebe0",
    "--md-mermaid-rule": "rgba(120, 90, 60, 0.1)",
    "--md-mermaid-margin": "rgba(180, 120, 90, 0.08)",
    "--md-mermaid-glow": "rgba(196, 165, 116, 0.18)",
    "--md-mermaid-font-size": "16px",
    "--md-mermaid-primary": "#efe2cc",
    "--md-mermaid-primary-text": "#2a2218",
    "--md-mermaid-primary-border": "#6b5344",
    "--md-mermaid-secondary": "#f7efe3",
    "--md-mermaid-secondary-text": "#2a2218",
    "--md-mermaid-secondary-border": "#a0896e",
    "--md-mermaid-tertiary": "#fff4df",
    "--md-mermaid-tertiary-text": "#2a2218",
    "--md-mermaid-tertiary-border": "#c4a574",
    "--md-mermaid-line": "#5c4a3a",
    "--md-mermaid-text": "#2a2218",
    "--md-mermaid-cluster": "#f0e6d8",
    "--md-mermaid-cluster-border": "#c4b39a",
    "--md-mermaid-note": "#fff4df",
    "--md-mermaid-note-border": "#c4a574",
    "--md-mermaid-activation": "#e6d5b8",
    "--md-mermaid-actor-line": "#8a7460",
  },
  mermaid: {
    theme: "base",
    look: "handDrawn",
  },
};
