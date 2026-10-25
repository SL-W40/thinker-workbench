/**
 * Markdown 文件查看模式偏好（编辑 / 预览）的 localStorage 读写。
 * 全局单份，跨工作空间与重启共享，避免每次打开 markdown 都回到「编辑」。
 */

export type MarkdownViewMode = "edit" | "preview";

export const MARKDOWN_VIEW_MODE_KEY = "tw.markdown.viewMode";

const DEFAULT_MODE: MarkdownViewMode = "edit";

/** 读取上次的查看模式；未设置或非法值回退到编辑。 */
export function loadMarkdownViewMode(): MarkdownViewMode {
  try {
    const raw = localStorage.getItem(MARKDOWN_VIEW_MODE_KEY);
    return raw === "preview" ? "preview" : "edit";
  } catch {
    return DEFAULT_MODE;
  }
}

/** 记录用户选择的查看模式。 */
export function saveMarkdownViewMode(mode: MarkdownViewMode): void {
  try {
    localStorage.setItem(MARKDOWN_VIEW_MODE_KEY, mode);
  } catch {
    /* 忽略配额等 */
  }
}
