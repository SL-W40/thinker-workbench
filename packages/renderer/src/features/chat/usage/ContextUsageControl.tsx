/**
 * Composer 上下文占用圆环 + Context Usage 弹层。
 *
 * 调度要点（曾出过 bug，勿回退）：
 * - 指纹只在**请求真正发出时**记账；否则依赖变化会清掉防抖定时器且不再补发，
 *   圆环会永久停在「看起来是 0」的假值。
 * - 已排队的定时器不被打断，避免流式高频改动导致防抖饥饿。
 * - 打开面板即强制刷新一次（打开态 80ms / 关闭态 1s）。
 */
import { CloseIcon, IconButton } from "@thinker-workbench/design/react";
import type {
  ChatMessage,
  ContextUsageSegmentId,
  ContextUsageSnapshot,
} from "@thinker-workbench/shared";
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getContextUsage,
  MODEL_SETTINGS_CHANGED,
  SESSION_CHAT_MODE_CHANGED,
} from "../../../platform/ipc/thinker";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import { extractContextPaths } from "../composer/composerMentions";
import {
  buildUsageSignature,
  shouldRequestUsage,
  toUsageMessages,
  usageDebounceMs,
} from "./usageSchedule";
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

/** 未知 / 不可用时的占位；绝不用 0 冒充「没占用」。 */
const DASH = "—";

type PopoverCoords = { top: number; left: number; width: number };

type Props = {
  messages: ChatMessage[];
  draft: string;
  workspaceRoot?: string | null;
};

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
  /** null = 首次估算尚未返回；有 error = 估算不可用。 */
  const [usage, setUsage] = useState<ContextUsageSnapshot | null>(null);
  /** 切换模型 / 模式后强制重算（正文可能一字未改）。 */
  const [refreshToken, setRefreshToken] = useState(0);
  /** 请求序号：只有最新一次请求的响应会被采纳。 */
  const seqRef = useRef(0);
  /** 已实际发出请求的指纹；只在定时器触发时写入。 */
  const askedSigRef = useRef<string | null>(null);
  /** 待发的防抖定时器；存在即表示已有一次估算在路上。 */
  const timerRef = useRef<number | null>(null);
  /** 供定时器回调读取的最新入参（避免把数组引用塞进依赖）。 */
  const latestRef = useRef({ messages, draft, workspaceRoot, refreshToken });
  latestRef.current = { messages, draft, workspaceRoot, refreshToken };
  /** 上一次的 open，用于识别「刚刚打开」。 */
  const prevOpenRef = useRef(open);

  const signature = buildUsageSignature({ messages, draft, workspaceRoot, refreshToken });

  useEffect(() => {
    const onModelChange = () => setRefreshToken((n) => n + 1);
    window.addEventListener(MODEL_SETTINGS_CHANGED, onModelChange);
    window.addEventListener(SESSION_CHAT_MODE_CHANGED, onModelChange);
    return () => {
      window.removeEventListener(MODEL_SETTINGS_CHANGED, onModelChange);
      window.removeEventListener(SESSION_CHAT_MODE_CHANGED, onModelChange);
    };
  }, []);

  useEffect(() => {
    const justOpened = prevOpenRef.current !== open;
    prevOpenRef.current = open;
    if (open && justOpened) {
      // 打开即刷新：丢掉关闭态排的低频定时器，按打开态重排
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      askedSigRef.current = null;
    }
    if (!shouldRequestUsage(open, signature, askedSigRef.current)) return;
    // 已有待发定时器就让它跑完（回调读最新入参），避免流式高频改动拖成饥饿
    if (timerRef.current !== null) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const latest = latestRef.current;
      // 关键：指纹在这里记账。定时器被取消后下一次仍会补发，不会永久停在空值
      askedSigRef.current = buildUsageSignature({
        messages: latest.messages,
        draft: latest.draft,
        workspaceRoot: latest.workspaceRoot,
        refreshToken: latest.refreshToken,
      });
      const seq = ++seqRef.current;
      const contextPaths = extractContextPaths(latest.draft);
      void getContextUsage({
        messages: toUsageMessages(latest.messages, latest.draft),
        workspaceRoot: latest.workspaceRoot ?? undefined,
        ...(contextPaths.length ? { contextPaths } : {}),
      })
        .then((snap) => {
          // 过期响应直接丢弃，避免圆环抖动
          if (seq !== seqRef.current) return;
          setUsage(snap);
        })
        .catch(() => {
          /* 估算失败保留上一次结果，不让圆环抖动 */
        });
    }, usageDebounceMs(open));
  }, [signature, open]);

  // 仅卸载时清理：清掉挂着的定时器
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

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

  const unavailable = Boolean(usage?.error);
  /** 可信快照：null 表示「还没算出来 / 算不出来」，一律显示 —。 */
  const snap = usage && !unavailable ? usage : null;
  const pct =
    snap && snap.limit > 0 ? Math.min(100, Math.round((snap.used / snap.limit) * 100)) : 0;
  const byId = new Map((snap?.segments ?? []).map((s) => [s.id, s.tokens]));
  const ordered = SEGMENT_ORDER.map((id) => ({
    id,
    tokens: byId.get(id) ?? 0,
  }));
  /** 进度条按窗口上限占比铺色，剩余为空轨（勿把已用段撑满整条）*/
  const limitForBar = snap && snap.limit > 0 ? snap.limit : 1;

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
              <span>
                {!usage
                  ? t("chat.contextUsage.calculating")
                  : unavailable
                    ? t("chat.contextUsage.unavailable")
                    : t("chat.contextUsage.pctFull", { pct: String(pct) })}
              </span>
              <span className="context-usage-popover__total">
                {snap
                  ? t("chat.contextUsage.tokensOf", {
                      used: formatCompactTokens(snap.used),
                      limit: formatCompactTokens(snap.limit),
                    })
                  : DASH}
              </span>
            </div>
            <div className="context-usage-meter" aria-hidden>
              {snap
                ? ordered.map((seg) =>
                    seg.tokens > 0 ? (
                      <i
                        key={seg.id}
                        className={`context-usage-meter__seg is-${seg.id}`}
                        style={{ width: `${(seg.tokens / limitForBar) * 100}%` }}
                      />
                    ) : null,
                  )
                : null}
            </div>
            <ul className="context-usage-list">
              {ordered.map((seg) => (
                <li key={seg.id}>
                  <span className="context-usage-list__label">
                    <i className={`context-usage-swatch is-${seg.id}`} aria-hidden />
                    {t(SEGMENT_KEYS[seg.id])}
                  </span>
                  <span className="context-usage-list__value">
                    {snap ? formatCompactTokens(seg.tokens) : DASH}
                  </span>
                </li>
              ))}
            </ul>
            <p className="context-usage-popover__hint">
              {!usage
                ? t("chat.contextUsage.calculating")
                : unavailable
                  ? t("chat.contextUsage.unavailableHint")
                  : t("chat.contextUsage.approxHint")}
            </p>
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
