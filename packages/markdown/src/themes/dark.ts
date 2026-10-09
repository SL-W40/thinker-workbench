/**
 * 基础深色 markdown 主题——黑白灰极简（夜间）。
 */
import type { MarkdownTheme } from "./types";

const SANS = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

/** 基础深色——高对比黑白。 */
export const darkTheme: MarkdownTheme = {
  id: "dark",
  vars: {
    "--md-fg": "#f2f2f2",
    "--md-fg-muted": "#a0a0a0",
    "--md-bg": "transparent",
    "--md-accent": "#f2f2f2",
    "--md-border": "rgba(255, 255, 255, 0.14)",
    "--md-panel": "#1a1a1a",
    "--md-code-bg": "#242424",
    "--md-code-fg": "#f2f2f2",
    "--md-pre-bg": "#0a0a0a",
    "--md-pre-fg": "#f2f2f2",
    "--md-blockquote-bg": "rgba(255, 255, 255, 0.05)",
    "--md-table-head": "rgba(255, 255, 255, 0.05)",
    "--md-danger": "#ff8a80",
    "--md-danger-bg": "rgba(255, 138, 128, 0.12)",
    "--md-shadow-soft": "rgba(0, 0, 0, 0.35)",
    "--md-stream-glow": "rgba(255, 255, 255, 0.08)",
    "--md-font-mono": MONO,
    "--md-font-hand": SANS,
    "--md-hl-keyword": "#e8e8e8",
    "--md-hl-string": "#c8c8c8",
    "--md-hl-number": "#d0d0d0",
    "--md-hl-comment": "#888888",
    "--md-hl-title": "#ffffff",
    "--md-hl-attr": "#e0e0e0",
    "--md-hl-built-in": "#d8d8d8",
    "--md-hl-literal": "#e8e8e8",
    "--md-hl-type": "#d4d4d4",
    "--md-hl-meta": "#f0f0f0",
    "--md-mermaid-dark": "true",
    "--md-mermaid-paper": "#141414",
    "--md-mermaid-rule": "rgba(255, 255, 255, 0.08)",
    "--md-mermaid-margin": "rgba(255, 255, 255, 0.06)",
    "--md-mermaid-glow": "transparent",
    "--md-mermaid-font-size": "15px",
    "--md-mermaid-primary": "#242424",
    "--md-mermaid-primary-text": "#f2f2f2",
    "--md-mermaid-primary-border": "#f2f2f2",
    "--md-mermaid-secondary": "#1a1a1a",
    "--md-mermaid-secondary-text": "#f2f2f2",
    "--md-mermaid-secondary-border": "#888888",
    "--md-mermaid-tertiary": "#2e2e2e",
    "--md-mermaid-tertiary-text": "#f2f2f2",
    "--md-mermaid-tertiary-border": "#666666",
    "--md-mermaid-line": "#c0c0c0",
    "--md-mermaid-text": "#f2f2f2",
    "--md-mermaid-cluster": "#111111",
    "--md-mermaid-cluster-border": "#444444",
    "--md-mermaid-note": "#2e2e2e",
    "--md-mermaid-note-border": "#888888",
    "--md-mermaid-activation": "#333333",
    "--md-mermaid-actor-line": "#888888",
  },
  mermaid: {
    theme: "dark",
    look: "classic",
  },
};
