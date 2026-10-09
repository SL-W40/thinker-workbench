/**
 * Tokens / 耗时 / Trace 胶囊：消息级挂在助手气泡下；亦可作会话级底栏。
 * Tokens 明细经 portal 挂到 body，按触发器位置上下翻转，避免被聊天区 overflow 裁切。
 */
import {
  ClockIcon,
  DatabaseIcon,
  InfoIcon,
  LogsIcon,
  Separator,
} from "@thinker-workbench/design/react";
import type { ModelUsage } from "@thinker-workbench/shared";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n/I18nProvider";
import {
  cacheHitRate,
  cacheMissTokens,
  formatElapsed,
  formatHitRate,
  formatTokenCount,
  replyTokens,
  totalTokens,
} from "./usageStats";
import "./ChatUsageBar.less";

/** 展示用短 id：取末段前 8 位。 */
function shortTraceId(id: string): string {
  const parts = id.split("_");
  return parts[parts.length - 1]?.slice(0, 8) ?? id.slice(-8);
}

type PopoverCoords = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const POPOVER_GAP = 8;
const POPOVER_PAD = 8;
const POPOVER_WIDTH = 280;
/** 判定「上方够用」的最小高度；不够则翻到下方。 */
const POPOVER_MIN_COMFORT = 200;

/** 相对触发器放置明细浮层：优先上方，空间不足则翻到下方，并夹入视口。 */
function placeUsagePopover(trigger: DOMRect): PopoverCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POPOVER_WIDTH, vw - POPOVER_PAD * 2);
  let left = trigger.left;
  if (left + width > vw - POPOVER_PAD) {
    left = Math.max(POPOVER_PAD, vw - width - POPOVER_PAD);
  }
  if (left < POPOVER_PAD) left = POPOVER_PAD;

  const spaceAbove = trigger.top - POPOVER_GAP - POPOVER_PAD;
  const spaceBelow = vh - trigger.bottom - POPOVER_GAP - POPOVER_PAD;
  const preferAbove =
    spaceAbove >= POPOVER_MIN_COMFORT || spaceAbove >= spaceBelow;

  if (preferAbove) {
    return {
      bottom: vh - trigger.top + POPOVER_GAP,
      left,
      width,
      maxHeight: Math.max(0, spaceAbove),
    };
  }
  return {
    top: trigger.bottom + POPOVER_GAP,
    left,
    width,
    maxHeight: Math.max(0, spaceBelow),
  };
}

type Props = {
  usage: ModelUsage;
  /** 已累计结束轮次耗时（ms）。 */
  durationMs: number;
  /** 当前轮开始时间；忙碌时叠加 live 段。 */
  runStartedAt: number | null;
  busy: boolean;
  /** `message`：气泡内；默认会话底栏布局。 */
  variant?: "session" | "message";
  /** 本轮追踪 id；有则展示可点击 Trace 胶囊。 */
  traceId?: string | null;
  /** 点击 Trace 胶囊：跳转控制台 Logs 并筛选该 id。 */
  onOpenTrace?: (traceId: string) => void;
};

/** 明细行：色点 + 标签 + 数值。 */
function UsageRow({
  label,
  value,
  swatch,
  nested = false,
  valueClassName,
}: {
  label: string;
  value: string;
  swatch?: "input" | "output" | "hit" | "miss" | "write" | "reasoning" | "reply" | "none";
  nested?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`chat-usage-row${nested ? " is-nested" : " is-parent"}`}>
      <span className="chat-usage-row__label">
        {swatch && swatch !== "none" ? (
          <span className={`chat-usage-swatch chat-usage-swatch--${swatch}`} aria-hidden />
        ) : nested ? (
          <span className="chat-usage-swatch chat-usage-swatch--none" aria-hidden />
        ) : null}
        {label}
      </span>
      <span className={`chat-usage-row__value${valueClassName ? ` ${valueClassName}` : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function ChatUsageBar({
  usage,
  durationMs,
  runStartedAt,
  busy,
  variant = "session",
  traceId = null,
  onOpenTrace,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // 忙碌时每秒刷新耗时
  useEffect(() => {
    if (!busy || runStartedAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, runStartedAt]);

  // 打开时按触发器位置重算；滚动 / 缩放时跟随
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const trigger = pillRef.current;
      if (!trigger) return;
      setCoords(placeUsagePopover(trigger.getBoundingClientRect()));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // 点击外侧 / Escape 关闭（仅 pill + portal，避免点 Trace 等同条胶囊时不关）
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pillRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // capture：避免中间层 stopPropagation 导致关不掉
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 聊天页 keep-alive（hidden）时 portal 仍挂在 body，需在切页 / 触发器被藏时主动关掉
  useEffect(() => {
    if (!open) return;
    const trigger = pillRef.current;
    if (!trigger) return;

    const close = () => setOpen(false);
    const closeIfTriggerHidden = () => {
      if (!trigger.isConnected || trigger.closest("[hidden]")) close();
    };

    const mo = new MutationObserver(closeIfTriggerHidden);
    let node: Element | null = trigger;
    while (node) {
      mo.observe(node, { attributes: true, attributeFilter: ["hidden"] });
      node = node.parentElement;
    }
    window.addEventListener("hashchange", close);
    closeIfTriggerHidden();

    return () => {
      mo.disconnect();
      window.removeEventListener("hashchange", close);
    };
  }, [open]);

  const liveExtra =
    busy && runStartedAt != null ? Math.max(0, now - runStartedAt) : 0;
  const displayMs = durationMs + liveExtra;
  const total = totalTokens(usage);
  const miss = cacheMissTokens(usage);
  const reply = replyTokens(usage);
  const hitRate = cacheHitRate(usage);
  const hitShare = usage.cacheReadTokens;
  const writeShare = usage.cacheWriteTokens;
  const missShare = miss;
  const barDenom = hitShare + writeShare + missShare;

  const popoverStyle: CSSProperties | undefined = coords
    ? {
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        ...(coords.top != null ? { top: coords.top } : {}),
        ...(coords.bottom != null ? { bottom: coords.bottom } : {}),
      }
    : undefined;

  const popover =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="chat-usage-popover"
            role="dialog"
            aria-label={t("chat.usage.detailTitle")}
            style={popoverStyle}
          >
            <div className="chat-usage-popover__head">
              <span>{t("chat.usage.detailTitle")}</span>
              <span className="chat-usage-popover__total">
                {t("chat.usage.total", { n: formatTokenCount(total) })}
              </span>
            </div>

            <div className="chat-usage-group">
              <UsageRow
                label={t("chat.usage.input")}
                value={formatTokenCount(usage.inputTokens)}
                swatch="input"
              />
              <div className="chat-usage-group__children" role="group">
                <UsageRow
                  label={t("chat.usage.cacheHit")}
                  value={formatTokenCount(usage.cacheReadTokens)}
                  swatch="hit"
                  nested
                />
                <UsageRow
                  label={t("chat.usage.cacheMiss")}
                  value={formatTokenCount(miss)}
                  swatch="miss"
                  nested
                />
                <UsageRow
                  label={t("chat.usage.cacheWrite")}
                  value={formatTokenCount(usage.cacheWriteTokens)}
                  swatch="write"
                  nested
                />
              </div>
            </div>

            <Separator className="chat-usage-popover__sep" />

            <div className="chat-usage-group">
              <UsageRow
                label={t("chat.usage.output")}
                value={formatTokenCount(usage.outputTokens)}
                swatch="output"
              />
              <div className="chat-usage-group__children" role="group">
                <UsageRow
                  label={t("chat.usage.reasoning")}
                  value={formatTokenCount(usage.reasoningTokens)}
                  swatch="reasoning"
                  nested
                />
                <UsageRow
                  label={t("chat.usage.reply")}
                  value={formatTokenCount(reply)}
                  swatch="reply"
                  nested
                />
              </div>
            </div>

            <Separator className="chat-usage-popover__sep" />

            <UsageRow
              label={t("chat.usage.hitRate")}
              value={formatHitRate(hitRate)}
              swatch="write"
              valueClassName="is-rate"
            />

            {barDenom > 0 ? (
              <>
                <div
                  className="chat-usage-bar-meter"
                  role="img"
                  aria-label={t("chat.usage.hitRate")}
                >
                  {hitShare > 0 ? (
                    <span
                      className="chat-usage-bar-meter__seg is-hit"
                      style={{ flex: hitShare }}
                    />
                  ) : null}
                  {writeShare > 0 ? (
                    <span
                      className="chat-usage-bar-meter__seg is-write"
                      style={{ flex: writeShare }}
                    />
                  ) : null}
                  {missShare > 0 ? (
                    <span
                      className="chat-usage-bar-meter__seg is-miss"
                      style={{ flex: missShare }}
                    />
                  ) : null}
                </div>
                <div className="chat-usage-legend">
                  <span>
                    <i className="chat-usage-swatch chat-usage-swatch--hit" />
                    {t("chat.usage.legendHit")}
                  </span>
                  <span>
                    <i className="chat-usage-swatch chat-usage-swatch--write" />
                    {t("chat.usage.legendWrite")}
                  </span>
                  <span>
                    <i className="chat-usage-swatch chat-usage-swatch--miss" />
                    {t("chat.usage.legendMiss")}
                  </span>
                </div>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`chat-usage-bar${variant === "message" ? " chat-usage-bar--message" : ""}`}
      ref={rootRef}
    >
      <div className="chat-usage-bar__pills">
        <div className="chat-usage-pill-wrap">
          <button
            ref={pillRef}
            type="button"
            className={`chat-usage-pill${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <DatabaseIcon size="sm" />
            <span>
              {t("chat.usage.tokens")}: {formatTokenCount(total)}
            </span>
            <InfoIcon size="sm" className="chat-usage-pill__info" />
          </button>
          {popover}
        </div>

        <span className="chat-usage-pill is-static" aria-label={t("chat.usage.elapsed")}>
          <ClockIcon size="sm" />
          <span>
            {t("chat.usage.elapsed")}: {formatElapsed(displayMs)}
          </span>
        </span>

        {traceId ? (
          onOpenTrace ? (
            <button
              type="button"
              className="chat-usage-pill"
              aria-label={t("chat.usage.traceAria", { id: traceId })}
              title={traceId}
              onClick={() => onOpenTrace(traceId)}
            >
              <LogsIcon size="sm" />
              <span>
                {t("chat.usage.trace")}: {shortTraceId(traceId)}
              </span>
            </button>
          ) : (
            <span
              className="chat-usage-pill is-static"
              aria-label={t("chat.usage.traceAria", { id: traceId })}
              title={traceId}
            >
              <LogsIcon size="sm" />
              <span>
                {t("chat.usage.trace")}: {shortTraceId(traceId)}
              </span>
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
