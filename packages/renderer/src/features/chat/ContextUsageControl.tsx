/**
 * Composer 上下文占用圆环 + Context Usage 弹层。
 */
import { CloseIcon, IconButton } from "@thinker-workbench/design/react";
import {
  type ChatMessage,
  type ContextUsageSegmentId,
  type ContextUsageSnapshot,
  emptyContextUsageSnapshot,
} from "@thinker-workbench/shared";
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getContextUsage } from "../../bridge/thinker";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import { extractContextPaths } from "./composerMentions";
import { visibleAssistantText } from "./messageModel";
import { formatCompactTokens } from "./usageStats";

const SEGMENT_ORDER: ContextUsageSegmentId[] = [
  "system",
  "tools",
  "rules",
  "skills",
  "contextFiles",
  "memory",
  "conversation",
];

const SEGMENT_KEYS: Record<ContextUsageSegmentId, MessageKey> = {
  system: "chat.contextUsage.system",
  tools: "chat.contextUsage.tools",
  rules: "chat.contextUsage.rules",
  skills: "chat.contextUsage.skills",
  contextFiles: "chat.contextUsage.contextFiles",
  memory: "chat.contextUsage.memory",
  conversation: "chat.contextUsage.conversation",
};

const POPOVER_GAP = 10;
const POPOVER_PAD = 8;
const POPOVER_WIDTH = 320;

type PopoverCoords = { top: number; left: number; width: number };

type Props = {
  messages: ChatMessage[];
  draft: string;
  workspaceRoot?: string | null;
};

/** 把 UI 消息 + 草稿转成估算请求*/
function toUsageMessages(messages: ChatMessage[], draft: string) {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.pending) continue;
    if (m.role === "user") {
      const content = m.text?.trim() ?? "";
      if (content) out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content = visibleAssistantText(m);
      if (content) out.push({ role: "assistant", content });
    }
  }
  const d = draft.trim();
  if (d) out.push({ role: "user", content: d });
  return out;
}

/**
 * 相对触发器放置弹层：下方够用则向下，否则向上；再夹入视口。 */
function placeContextPopover(trigger: DOMRect, menuW: number, menuH: number): PopoverCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(menuW, vw - POPOVER_PAD * 2);
  const spaceBelow = vh - trigger.bottom - POPOVER_GAP - POPOVER_PAD;
  const spaceAbove = trigger.top - POPOVER_GAP - POPOVER_PAD;
  const openBelow = spaceBelow >= menuH || spaceBelow >= spaceAbove;

  let top = openBelow ? trigger.bottom + POPOVER_GAP : trigger.top - POPOVER_GAP - menuH;
  if (top + menuH > vh - POPOVER_PAD) top = Math.max(POPOVER_PAD, vh - POPOVER_PAD - menuH);
  if (top < POPOVER_PAD) top = POPOVER_PAD;

  // 右对齐触发器（圆环在 Composer 右侧：
  let left = trigger.right - width;
  if (left + width > vw - POPOVER_PAD) left = vw - POPOVER_PAD - width;
  if (left < POPOVER_PAD) left = POPOVER_PAD;

  return { top, left, width };
}

/** 圆环 + 弹层*/
export function ContextUsageControl({ messages, draft, workspaceRoot }: Props) {
  const t = useT();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const [usage, setUsage] = useState<ContextUsageSnapshot>(() => emptyContextUsageSnapshot());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        const contextPaths = extractContextPaths(draft);
        void getContextUsage({
          messages: toUsageMessages(messages, draft),
          workspaceRoot: workspaceRoot ?? undefined,
          ...(contextPaths.length ? { contextPaths } : {}),
        }).then((snap) => {
          if (!cancelled) setUsage(snap);
        });
      },
      open ? 80 : 400,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [messages, draft, workspaceRoot, open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const trigger = btnRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const tr = trigger.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_PAD * 2);
      setCoords(placeContextPopover(tr, width, pr.height));
    }
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // 页面 / 聊天区滚动时关掉，避免浮层与触发器脱
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const byId = new Map(usage.segments.map((s) => [s.id, s.tokens]));
  const ordered = SEGMENT_ORDER.map((id) => ({
    id,
    tokens: byId.get(id) ?? 0,
  }));
  /** 进度条按窗口上限占比铺色，剩余为空轨（勿把已用段撑满整条）*/
  const limitForBar = usage.limit > 0 ? usage.limit : 1;

  const r = 7;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  const popoverStyle: CSSProperties = coords
    ? { top: coords.top, left: coords.left, width: coords.width }
    : {
        top: 0,
        left: 0,
        width: Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_PAD * 2),
        visibility: "hidden",
      };

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="context-usage-popover"
            role="dialog"
            aria-label={t("chat.contextUsage.title")}
            style={popoverStyle}
          >
            <div className="context-usage-popover__head">
              <span>{t("chat.contextUsage.title")}</span>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={t("chat.contextUsage.close")}
                onClick={() => setOpen(false)}
              >
                <CloseIcon size="sm" />
              </IconButton>
            </div>
            <div className="context-usage-popover__summary">
              <span>{t("chat.contextUsage.pctFull", { pct: String(pct) })}</span>
              <span className="context-usage-popover__total">
                {t("chat.contextUsage.tokensOf", {
                  used: formatCompactTokens(usage.used),
                  limit: formatCompactTokens(usage.limit),
                })}
              </span>
            </div>
            <div className="context-usage-meter" aria-hidden>
              {ordered.map((seg) =>
                seg.tokens > 0 ? (
                  <i
                    key={seg.id}
                    className={`context-usage-meter__seg is-${seg.id}`}
                    style={{ width: `${(seg.tokens / limitForBar) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="context-usage-list">
              {ordered.map((seg) => (
                <li key={seg.id}>
                  <span className="context-usage-list__label">
                    <i className={`context-usage-swatch is-${seg.id}`} aria-hidden />
                    {t(SEGMENT_KEYS[seg.id])}
                  </span>
                  <span className="context-usage-list__value">
                    {formatCompactTokens(seg.tokens)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="context-usage-popover__hint">{t("chat.contextUsage.approxHint")}</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="context-usage-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`context-usage-ring${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("chat.contextUsage.ringAria", { pct: String(pct) })}
        title={t("chat.contextUsage.title")}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle
            className="context-usage-ring__track"
            cx="9"
            cy="9"
            r={r}
            fill="none"
            strokeWidth="1.6"
          />
          <circle
            className="context-usage-ring__arc"
            cx="9"
            cy="9"
            r={r}
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform="rotate(-90 9 9)"
          />
        </svg>
      </button>
      {popover}
    </div>
  );
}
