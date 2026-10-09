/**
 * Markdown 链接点击回调（由宿主注入，如内置浏览器）。
 */
import { createContext, useContext } from "react";

/** 返回 true 表示已处理（应 preventDefault）。 */
export type MarkdownLinkClickHandler = (href: string) => boolean | undefined;

export const MarkdownLinkClickContext = createContext<MarkdownLinkClickHandler | null>(
  null,
);

export function useMarkdownLinkClick(): MarkdownLinkClickHandler | null {
  return useContext(MarkdownLinkClickContext);
}
