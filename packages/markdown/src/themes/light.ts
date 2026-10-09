/**
 * 基础浅色 markdown 主题——黑白灰极简。
 */
import type { MarkdownTheme } from "./types";

const SANS = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

/** 基础浅色——高对比黑白。 */
export const lightTheme: MarkdownTheme = {
  id: "light",
  vars: {
    "--md-fg": "#111111",
    "--md-fg-muted": "#666666",
    "--md-bg": "transparent",
    "--md-accent": "#111111",
    "--md-border": "rgba(0, 0, 0, 0.12)",
    "--md-panel": "#f5f5f5",
    "--md-code-bg": "#efefef",
    "--md-code-fg": "#111111",
    /* 与 FileDiff 统一的浅色代码面 */
    "--md-pre-bg": "#f5f5f5",
    "--md-pre-fg": "#111111",
    "--md-blockquote-bg": "rgba(0, 0, 0, 0.04)",
    "--md-table-head": "rgba(0, 0, 0, 0.04)",
    "--md-danger": "#b00020",
    "--md-danger-bg": "rgba(176, 0, 32, 0.08)",
    "--md-shadow-soft": "rgba(0, 0, 0, 0.08)",
    "--md-stream-glow": "rgba(0, 0, 0, 0.08)",
    "--md-font-mono": MONO,
    "--md-font-hand": SANS,
    "--md-hl-keyword": "#111111",
    "--md-hl-string": "#1a7f37",
    "--md-hl-number": "#b00020",
    "--md-hl-comment": "#666666",
    "--md-hl-title": "#111111",
    "--md-hl-attr": "#333333",
    "--md-hl-built-in": "#1a7f37",
    "--md-hl-literal": "#111111",
    "--md-hl-type": "#333333",
    "--md-hl-meta": "#666666",
    "--md-mermaid-dark": "false",
    "--md-mermaid-paper": "#ffffff",
    "--md-mermaid-rule": "rgba(0, 0, 0, 0.08)",
    "--md-mermaid-margin": "rgba(0, 0, 0, 0.04)",
    "--md-mermaid-glow": "transparent",
    "--md-mermaid-font-size": "15px",
    "--md-mermaid-primary": "#f0f0f0",
    "--md-mermaid-primary-text": "#111111",
    "--md-mermaid-primary-border": "#111111",
    "--md-mermaid-secondary": "#ffffff",
    "--md-mermaid-secondary-text": "#111111",
    "--md-mermaid-secondary-border": "#999999",
    "--md-mermaid-tertiary": "#e8e8e8",
    "--md-mermaid-tertiary-text": "#111111",
    "--md-mermaid-tertiary-border": "#666666",
    "--md-mermaid-line": "#333333",
    "--md-mermaid-text": "#111111",
    "--md-mermaid-cluster": "#f5f5f5",
    "--md-mermaid-cluster-border": "#cccccc",
    "--md-mermaid-note": "#f5f5f5",
    "--md-mermaid-note-border": "#999999",
    "--md-mermaid-activation": "#e0e0e0",
    "--md-mermaid-actor-line": "#666666",
  },
  mermaid: {
    theme: "neutral",
    look: "classic",
  },
};
