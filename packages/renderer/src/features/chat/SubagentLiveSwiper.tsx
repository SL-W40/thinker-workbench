/**
 * 子代理卡片底栏：活动文案单行上下滚动（swiper），
 * 按 markdown 解析但视觉统一为正文（无标题/代码块样式）。
 */
import { parseInline, type InlineNode } from "@thinker-workbench/markdown";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 已本地化的活动文案 */
  text: string;
};

const SLIDE_MS = 280;

/** 围栏/换行压成单行，供行内解析。 */
function flattenToInlineMarkdown(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  // 闭合围栏 → 内文
  s = s.replace(/```[\w+-]*\r?\n?([\s\S]*?)```/g, (_, body: string) =>
    String(body).replace(/\s+/g, " ").trim(),
  );
  // 未闭合围栏头
  s = s.replace(/```[\w+-]*\r?\n?/g, "");
  // 标题标记当普通文本
  s = s.replace(/^#{1,6}\s+/gm, "");
  return s.replace(/\s+/g, " ").trim();
}

/** 行内节点一律 span，字号字重继承正文。 */
function renderPlainInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
      case "code":
      case "kbd":
      case "math":
        return <span key={index}>{node.value}</span>;
      case "break":
        return <span key={index}> </span>;
      case "strong":
      case "emphasis":
      case "strike":
      case "mark":
      case "underline":
      case "sub":
      case "sup":
        return <span key={index}>{renderPlainInline(node.children)}</span>;
      case "link":
        return <span key={index}>{renderPlainInline(node.children)}</span>;
      case "autolink":
        return <span key={index}>{node.text}</span>;
      case "image":
        return <span key={index}>{node.alt || ""}</span>;
      case "footnoteRef":
        return null;
      default:
        return null;
    }
  });
}

function LiveLine({ text }: { text: string }) {
  const md = useMemo(() => flattenToInlineMarkdown(text), [text]);
  const nodes = useMemo(() => (md ? parseInline(md) : []), [md]);
  return (
    <span className="run-subagent-card__swiper-text">
      {nodes.length ? renderPlainInline(nodes) : md}
    </span>
  );
}

/**
 * 每次 text 变化：旧行上滑离场，新行从下方滑入；视口只露一行。
 */
export function SubagentLiveSwiper({ text }: Props) {
  const [current, setCurrent] = useState(text);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "slide">("idle");
  const timerRef = useRef<number | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const next = text.trim();
    const prev = currentRef.current.trim();
    if (!next) return;
    if (next === prev) return;
    // 首条直接落地，不滑
    if (!prev) {
      setCurrent(next);
      setOutgoing(null);
      setPhase("idle");
      return;
    }
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOutgoing(prev);
    setCurrent(next);
    setPhase("slide");
    timerRef.current = window.setTimeout(() => {
      setOutgoing(null);
      setPhase("idle");
      timerRef.current = null;
    }, SLIDE_MS);
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text]);

  return (
    <div className="run-subagent-card__swiper" aria-live="polite">
      <div
        className={`run-subagent-card__swiper-track${phase === "slide" ? " is-sliding" : ""}`}
      >
        {outgoing != null ? (
          <div className="run-subagent-card__swiper-line is-out" aria-hidden>
            <LiveLine text={outgoing} />
          </div>
        ) : null}
        <div className="run-subagent-card__swiper-line is-in">
          <LiveLine text={current} />
        </div>
      </div>
    </div>
  );
}
