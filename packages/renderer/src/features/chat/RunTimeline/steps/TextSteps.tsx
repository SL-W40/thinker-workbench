/**
 * 文本 / 思考 / 状态步骤行。
 */
import { useDesignTheme } from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isBrowserableUrl, requestOpenBrowser } from "../../../../bridge/browser";
import { useT } from "../../../../i18n/useI18n";
import { formatThoughtLabel } from "../format";
import { TimelineChevron } from "../TimelineChevron";

/** Thinking→Thought：无正文时活动中显示 Planning；已结束且无正文则不渲染。*/
export function StatusStepRow({
  step,
  live = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "status" }>;
  live?: boolean;
}) {
  const t = useT();
  const body = step.text?.trim() ?? "";
  const hasBody = Boolean(body);
  const [collapsed, setCollapsed] = useState(true);
  // 流式（thinking 进行中）默认展开；思考结束自动收起
  const active = Boolean(live && step.active);
  useEffect(() => {
    if (!active) setCollapsed(true);
  }, [active]);
  const open = hasBody && (active || !collapsed);
  // 历史空壳 Thought（无 reasoning）不展示
  if (!active && !hasBody) return null;
  const asPlanning = active && !hasBody;
  /** planning / thinking / thought：切换时 remount 触发标签过渡 */
  const labelMode = asPlanning ? "planning" : active ? "thinking" : "thought";

  // 历史展示只用已结算的 durationMs；禁止用 startedAt+墙钟（刷新会越刷越大：
  let label: string;
  if (asPlanning) {
    label = t("chat.planning");
  } else if (active) {
    label = t("chat.thinking");
  } else {
    label = formatThoughtLabel(t, step.durationMs);
  }

  const labelNode = (
    <span className="run-timeline-label-enter" key={labelMode}>
      <span className={`run-timeline-label${active ? " run-timeline-label--shimmer" : ""}`}>
        {label}
      </span>
    </span>
  );

  return (
    <li
      className={`run-timeline-item run-timeline-item--status${active ? " is-active" : ""}${hasBody ? " is-expandable" : ""}`}
    >
      <div className="run-timeline-status">
        {hasBody ? (
          <button
            type="button"
            className="run-timeline-status-toggle is-expandable"
            aria-expanded={open}
            aria-label={open ? t("chat.thinkingCollapse") : t("chat.thinkingExpand")}
            onClick={() => setCollapsed((v) => !v)}
          >
            {labelNode}
            <TimelineChevron open={open} />
          </button>
        ) : (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 不可折叠的状态行仅作命名展示区，无交互语义
          <div
            className="run-timeline-status-toggle"
            aria-label={asPlanning ? t("chat.planning") : label}
          >
            {labelNode}
          </div>
        )}
        {open ? <ThinkingBody text={step.text ?? ""} /> : null}
      </div>
    </li>
  );
}

/**
 * 思考正文：最多约 4 行，超出可滚；左侧竖线（同 Explored 子列表），
 * 上下用渐隐遮罩标示可继续滚动。 */
function ThinkingBody({ text }: { text: string }) {
  const scrollerRef = useRef<HTMLPreElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  // 跟随底部开关：仅当用户已贴在底部（pinned）时才随流式内容增长自动滚底；
  // 用户上滚阅读即解除，避免刷新把视角不停拽回底部。
  const pinnedRef = useRef(true);

  // 仅更新上下渐隐遮罩，不改动滚动位置
  const syncFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight > clientHeight + 1;
    setFadeTop(overflow && scrollTop > 1);
    setFadeBottom(overflow && scrollTop + clientHeight < scrollHeight - 1);
  }, []);

  // 内容增长（流式）：仅当钉住底部才滚到底，否则只更新遮罩
  const followIfPinned = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncFades();
    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [syncFades]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // 用户滚动：判定是否仍在底部附近，并刷新遮罩
    function onScroll() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      pinnedRef.current = scrollHeight - scrollTop - clientHeight < 6;
      syncFades();
    }

    syncFades();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(followIfPinned) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [followIfPinned, syncFades]);

  // 正文增长跟随：pre 被 max-height 夹住后自身盒子尺寸不再变化，
  // ResizeObserver 不会触发，必须随 text 变化主动跟随。
  // biome-ignore lint/correctness/useExhaustiveDependencies: text 未在函数体读取但刻意保留：流式正文增长后需要重新执行贴底跟随
  useLayoutEffect(() => {
    followIfPinned();
  }, [followIfPinned, text]);

  return (
    <div
      className={`run-timeline-thinking-box${fadeTop ? " has-fade-top" : ""}${fadeBottom ? " has-fade-bottom" : ""}`}
    >
      <pre ref={scrollerRef} className="run-timeline-thinking">
        {text}
      </pre>
    </div>
  );
}

/** 对用户可见的叙述，按事件顺序插在工具前后*/
export function TextStepRow({
  step,
  live = false,
  transition = false,
}: {
  step: Extract<ChatTimelineStep, { kind: "text" }>;
  /** 仍在流式时才显示 caret；已停止则收束未闭合代码块*/
  live?: boolean;
  /** 承上启下小结行：单行短句、后面还有工具 / 思考步骤时以独立样式呈现。 */
  transition?: boolean;
}) {
  const { markdownTheme } = useDesignTheme();
  if (!step.text.trim()) return null;
  if (transition) {
    return (
      <li className="run-timeline-item run-timeline-item--transition">
        <div className="run-timeline-transition">{step.text}</div>
      </li>
    );
  }
  return (
    <li className="run-timeline-item run-timeline-item--text">
      <div className="run-timeline-reply">
        <StreamingMarkdownView
          markdown={step.text}
          theme={markdownTheme}
          streaming={live}
          onLinkClick={(href) => {
            if (!isBrowserableUrl(href)) return false;
            requestOpenBrowser(href);
            return true;
          }}
        />
      </div>
    </li>
  );
}
