/**
 * 行内节点序列渲染：把一串 InlineNode 映射成 React 节点。
 *
 * 含图片失败兜底与链接点击接管；脚注引用编号通过上下文下发，
 * 由根组件在渲染文档前建一次 registry。
 */
import type { MouseEvent, ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { sanitizeImageSrc, sanitizeUrl } from "../parse/url";
import type { InlineNode } from "../types";
import { type MarkdownLinkClickHandler, useMarkdownLinkClick } from "./LinkClickContext";
import { MathView } from "./MathView";

export type FnRegistry = { next: (id: string) => string };

export const FootnoteRefContext = createContext<FnRegistry | null>(null);

export function createFnRegistry(): FnRegistry {
  const counts = new Map<string, number>();
  return {
    next(id: string) {
      const n = counts.get(id) ?? 0;
      counts.set(id, n + 1);
      const enc = encodeURIComponent(id);
      return n === 0 ? `fnref-${enc}` : `fnref-${enc}-${n}`;
    },
  };
}

export function useLinkClickHandler() {
  const onLinkClick = useMarkdownLinkClick();
  return (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onLinkClick) return;
    const handled = onLinkClick(href);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

export function InlineView({ nodes }: { nodes: InlineNode[] }): ReactNode {
  const onAnchorClick = useLinkClickHandler();
  const fnRefs = useContext(FootnoteRefContext);
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <span key={index}>{node.value}</span>;
      case "code":
        return <code key={index}>{node.value}</code>;
      case "kbd":
        return <kbd key={index}>{node.value}</kbd>;
      case "strong":
        return (
          <strong key={index}>
            <InlineView nodes={node.children} />
          </strong>
        );
      case "emphasis":
        return (
          <em key={index}>
            <InlineView nodes={node.children} />
          </em>
        );
      case "strike":
        return (
          <del key={index}>
            <InlineView nodes={node.children} />
          </del>
        );
      case "mark":
        return (
          <mark key={index}>
            <InlineView nodes={node.children} />
          </mark>
        );
      case "sub":
        return (
          <sub key={index}>
            <InlineView nodes={node.children} />
          </sub>
        );
      case "sup":
        return (
          <sup key={index}>
            <InlineView nodes={node.children} />
          </sup>
        );
      case "underline":
        return (
          <u key={index}>
            <InlineView nodes={node.children} />
          </u>
        );
      case "link": {
        const href = sanitizeUrl(node.href);
        if (!href) {
          return (
            <span key={index}>
              <InlineView nodes={node.children} />
            </span>
          );
        }
        return (
          <a key={index} href={href} title={node.title} onClick={onAnchorClick(href)}>
            <InlineView nodes={node.children} />
          </a>
        );
      }
      case "autolink": {
        const href = sanitizeUrl(node.href);
        if (!href) return <span key={index}>{node.text}</span>;
        return (
          <a key={index} href={href} onClick={onAnchorClick(href)}>
            {node.text}
          </a>
        );
      }
      case "image":
        return <MdImage key={index} src={node.src} alt={node.alt} title={node.title} />;
      case "footnoteRef": {
        const refId = fnRefs?.next(node.id) ?? `fnref-${encodeURIComponent(node.id)}`;
        return (
          <sup key={index} className="tw-md-fn-ref">
            <a href={`#fn-${encodeURIComponent(node.id)}`} id={refId}>
              {node.id}
            </a>
          </sup>
        );
      }
      case "math":
        return <MathView key={index} value={node.value} />;
      case "break":
        return <br key={index} />;
      default:
        return null;
    }
  });
}

export function MdImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = sanitizeImageSrc(src);
  if (failed || !safeSrc) {
    return (
      <span className="tw-md-img-fallback" role="img" aria-label={alt || "image"}>
        {alt || "image"}
      </span>
    );
  }
  return <img src={safeSrc} alt={alt} title={title} onError={() => setFailed(true)} />;
}
