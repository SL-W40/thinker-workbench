/**
 * 护眼创意主题——柔和灰绿纸面，降低长时间阅读刺眼感。
 */
import type { MarkdownTheme } from "./types";

const HAND = '"Segoe Print", "Bradley Hand", "Apple Chancery", "TW Hand", cursive';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

/** 护眼——柔和灰绿。 */
export const eyecareTheme: MarkdownTheme = {
  id: "eyecare",
  vars: {
    "--md-fg": "#2f3a2c",
    "--md-fg-muted": "#5f6d5a",
    "--md-bg": "transparent",
    "--md-accent": "#4f6f52",
    "--md-border": "rgba(79, 111, 82, 0.2)",
    "--md-panel": "#f4f6ee",
    "--md-code-bg": "#e2e8d8",
    "--md-code-fg": "#2f3a2c",
    /* 与 FileDiff 统一的浅色代码面 */
    "--md-pre-bg": "#f4f6ee",
    "--md-pre-fg": "#2f3a2c",
    "--md-blockquote-bg": "rgba(79, 111, 82, 0.1)",
    "--md-table-head": "rgba(79, 111, 82, 0.08)",
    "--md-danger": "#9b3b2e",
    "--md-danger-bg": "rgba(155, 59, 46, 0.1)",
    "--md-shadow-soft": "rgba(47, 58, 44, 0.08)",
    "--md-stream-glow": "rgba(79, 111, 82, 0.22)",
    "--md-font-mono": MONO,
    "--md-font-hand": HAND,
    "--md-hl-keyword": "#3d5a40",
    "--md-hl-string": "#1a7f37",
    "--md-hl-number": "#9b3b2e",
    "--md-hl-comment": "#5f6d5a",
    "--md-hl-title": "#2f3a2c",
    "--md-hl-attr": "#3a4a36",
    "--md-hl-built-in": "#3d6b4f",
    "--md-hl-literal": "#3d5a40",
    "--md-hl-type": "#3d5a40",
    "--md-hl-meta": "#5f6d5a",
    "--md-mermaid-dark": "false",
    "--md-mermaid-paper": "#eef2e6",
    "--md-mermaid-rule": "rgba(79, 111, 82, 0.12)",
    "--md-mermaid-margin": "rgba(79, 111, 82, 0.1)",
    "--md-mermaid-glow": "rgba(79, 111, 82, 0.14)",
    "--md-mermaid-font-size": "16px",
    "--md-mermaid-primary": "#e2e8d8",
    "--md-mermaid-primary-text": "#2f3a2c",
    "--md-mermaid-primary-border": "#4f6f52",
    "--md-mermaid-secondary": "#f4f6ee",
    "--md-mermaid-secondary-text": "#2f3a2c",
    "--md-mermaid-secondary-border": "#7a9478",
    "--md-mermaid-tertiary": "#f7faf2",
    "--md-mermaid-tertiary-text": "#2f3a2c",
    "--md-mermaid-tertiary-border": "#6a8a6c",
    "--md-mermaid-line": "#4a5c48",
    "--md-mermaid-text": "#2f3a2c",
    "--md-mermaid-cluster": "#e8ede0",
    "--md-mermaid-cluster-border": "#a0b49c",
    "--md-mermaid-note": "#f7faf2",
    "--md-mermaid-note-border": "#6a8a6c",
    "--md-mermaid-activation": "#d4dec8",
    "--md-mermaid-actor-line": "#6a8a6c",
  },
  mermaid: {
    theme: "base",
    look: "handDrawn",
  },
};
