/**
 * Composer 上下文占用圆环 + Context Usage 弹层。
 * 数据来自 getContextUsage → engine assembleContext。
 */
import { CloseIcon, IconButton } from "@thinker-workbench/design/react";
import {
  emptyContextUsageSnapshot,
  type ContextUsageSegmentId,
  type ContextUsageSnapshot,
} from "@thinker-workbench/shared";
import { useEffect, useId, useRef, useState } from "react";
import { getContextUsage } from "../../bridge/thinker";
import { extractContextPaths } from "./composerMentions";
import { useT } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import { formatCompactTokens } from "./usageStats";
import { visibleAssistantText } from "./messageModel";
import type { ChatMessage } from "@thinker-workbench/shared";

const SEGMENT_ORDER: ContextUsageSegmentId[] = [
  "system",
  "tools",
  "rules",
  "skills",
  "contextFiles",
  "conversation",
];

const SEGMENT_KEYS: Record<ContextUsageSegmentId, MessageKey> = {
  system: "chat.contextUsage.system",
  tools: "chat.contextUsage.tools",
  rules: "chat.contextUsage.rules",
  skills: "chat.contextUsage.skills",
  contextFiles: "chat.contextUsage.contextFiles",
  conversation: "chat.contextUsage.conversation",
};

type Props = {
  messages: ChatMessage[];
  draft: string;
  workspaceRoot?: string | null;
};

/** 把 UI 消息 + 草稿转成估算请求。 */
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

/** 圆环 + 弹层。 */
export function ContextUsageControl({ messages, draft, workspaceRoot }: Props) {
  const t = useT();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<ContextUsageSnapshot>(() => emptyContextUsageSnapshot());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const contextPaths = extractContextPaths(draft);
      void getContextUsage({
        messages: toUsageMessages(messages, draft),
        workspaceRoot: workspaceRoot ?? undefined,
        ...(contextPaths.length ? { contextPaths } : {}),
      }).then((snap) => {
        if (!cancelled) setUsage(snap);
      });
    }, open ? 80 : 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [messages, draft, workspaceRoot, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const pct =
    usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const byId = new Map(usage.segments.map((s) => [s.id, s.tokens]));
  const ordered = SEGMENT_ORDER.map((id) => ({
    id,
    tokens: byId.get(id) ?? 0,
  }));
  const totalSeg = ordered.reduce((s, x) => s + x.tokens, 0) || 1;

  const r = 7;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="context-usage-wrap" ref={wrapRef}>
      <button
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
      {open ? (
        <div
          id={panelId}
          className="context-usage-popover"
          role="dialog"
          aria-label={t("chat.contextUsage.title")}
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
                  style={{ flexGrow: seg.tokens / totalSeg, flexBasis: 0 }}
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
        </div>
      ) : null}
    </div>
  );
}
