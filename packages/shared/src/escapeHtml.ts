/**
 * HTML 元字符转义：供拼接 innerHTML / `data:text/html` 等场景安全插入不可信文本。
 * renderer（ChangesPane）与 desktop（overlayHtml）原先各写一份，现收敛于此作为单一实现。
 */

/**
 * 把 HTML 元字符转义为实体。
 * 覆盖 `&`、`<`、`>`、`"`（文本与属性上下文均安全）；`'` 不转义（属性一律用双引号包裹）。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
