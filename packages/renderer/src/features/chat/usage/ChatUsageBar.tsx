/**
 * Tokens / 耗时 / Trace 胶囊（编排壳）：消息级挂在助手气泡下；亦可作会话级底栏。
 * 单行不换行；宽度不足时右侧溢出入「⋯」悬停菜单。
 *
 * 浮层定位纯函数见 ./popover，明细行见 ./UsageRow，三点触发器见 ./MoreDots。
 */
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DatabaseIcon,
  InfoIcon,
  LogsIcon,
  Separator,
} from "@thinker-workbench/design/react";
import type { ModelUsage } from "@thinker-workbench/shared";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../ui/i18n/useI18n";
import { visiblePillCount } from "./usageBarOverflow";
import {
  cacheHitRate,
  cacheMissTokens,
  EMPTY_USAGE,
  formatDurationOrDash,
  formatHitRate,
  formatTokenCount,
  formatUsageTokens,
  replyTokens,
  totalTokens,
} from "./usageStats";
import "./ChatUsageBar.less";
import { MoreDots } from "./MoreDots";
import {
  type MoreMenuCoords,
  type PopoverCoords,
  placeMoreMenu,
  placeUsagePopover,
  shortTraceId,
} from "./popover";
import { UsageRow } from "./UsageRow";

type SlotId = "copy" | "tokens" | "elapsed" | "trace";

const PILL_GAP = 8;
/** 与 `.chat-usage-more__trigger` 视觉宽度一致，避免 more 未挂载时测不准。 */
const MORE_TRIGGER_WIDTH = 28;

type Props = {
  /** 本轮用量；缺省表示未知（UI 展示「—」，绝不显示 0）*/
  usage?: ModelUsage | null;
  /** `usage` 是否含粗估成分（UI 加 ~ 前缀）。 */
  usageEstimated?: boolean;
  /** 已累计结束轮次耗时（ms）；缺省表示未知（UI 展示「—」）*/
  durationMs?: number | null;
  /** 当前轮开始时间；忙碌时叠加 live 段*/
  runStartedAt: number | null;
  busy: boolean;
  /** `message`：气泡内；默认会话底栏布局*/
  variant?: "session" | "message";
  /** 本轮追踪 id；有则展示可点击 Trace 胶囊*/
  traceId?: string | null;
  /** 点击 Trace 胶囊：跳转控制台 Logs 并筛选该 id*/
  onOpenTrace?: (traceId: string) => void;
  /** 是否在「⋯」中提供复制（与胶囊同级数据，菜单内统一渲染）*/
  showCopy?: boolean;
  /** 刚复制成功时切换文案 / 图标*/
  copied?: boolean;
  /** 复制正文*/
  onCopy?: () => void;
};

export function ChatUsageBar({
  usage,
  usageEstimated = false,
  durationMs,
  runStartedAt,
  busy,
  variant = "session",
  traceId = null,
  onOpenTrace,
  showCopy = false,
  copied = false,
  onCopy,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreCoords, setMoreCoords] = useState<MoreMenuCoords | null>(null);
  /** 主行可见槽位数；初始用大数先全部挂载测宽，再收敛，避免 opacity 闪烁 */
  const [visibleCount, setVisibleCount] = useState(16);
  const rootRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreCloseTimerRef = useRef<number | null>(null);
  const widthCacheRef = useRef<Partial<Record<SlotId, number>>>({});
  const panelId = useId();
  const moreMenuId = useId();

  // Copy 默认只在「⋯」里；主行仅 Tokens / 耗时 / Trace
  const hasCopy = Boolean(showCopy && onCopy);
  const hasTrace = Boolean(traceId);
  const mainSlotOrder = useMemo(() => {
    const ids: SlotId[] = ["tokens", "elapsed"];
    if (hasTrace) ids.push("trace");
    return ids;
  }, [hasTrace]);

  const effectiveVisible = Math.min(visibleCount, mainSlotOrder.length);
  const visibleIds = mainSlotOrder.slice(0, effectiveVisible);
  const overflowIds = useMemo(() => {
    const ids: SlotId[] = [];
    if (hasCopy) ids.push("copy");
    for (let i = effectiveVisible; i < mainSlotOrder.length; i++) {
      const id = mainSlotOrder[i];
      if (id) ids.push(id);
    }
    return ids;
  }, [hasCopy, effectiveVisible, mainSlotOrder]);
  const showMore = overflowIds.length > 0;
  // Tokens 明细浮层在 body 上：从 overflow 菜单点开后，鼠标离开「⋯」也不要卸掉菜单
  const moreMenuOpen = moreOpen || (open && overflowIds.includes("tokens"));
  const overflowKey = overflowIds.join(",");

  function cancelMoreClose() {
    if (moreCloseTimerRef.current != null) {
      window.clearTimeout(moreCloseTimerRef.current);
      moreCloseTimerRef.current = null;
    }
  }

  function openMoreMenu() {
    cancelMoreClose();
    setMoreOpen(true);
  }

  function scheduleCloseMoreMenu() {
    cancelMoreClose();
    moreCloseTimerRef.current = window.setTimeout(() => {
      moreCloseTimerRef.current = null;
      const overTrigger = moreWrapRef.current?.matches(":hover");
      const overMenu = moreMenuRef.current?.matches(":hover");
      if (!overTrigger && !overMenu) setMoreOpen(false);
    }, 120);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: 卸载清理只需执行一次；cancelMoreClose 每次渲染重建，不应进依赖
  useEffect(() => {
    return () => cancelMoreClose();
  }, []);

  // 忙碌时每秒刷新耗时
  useEffect(() => {
    if (!busy || runStartedAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, runStartedAt]);

  const liveExtra = busy && runStartedAt != null ? Math.max(0, now - runStartedAt) : 0;
  // 未知（引擎没给）且无 live 段时不编造：保持 undefined，展示层画「—」
  const displayMs =
    durationMs == null || !Number.isFinite(durationMs)
      ? liveExtra > 0
        ? liveExtra
        : undefined
      : durationMs + liveExtra;
  // 用量未知时 total 为 undefined（胶囊展示「—」）；明细浮层仍按空用量渲染各行为 0
  const usageView = usage ?? EMPTY_USAGE;
  const total = usage ? totalTokens(usage) : undefined;
  const miss = cacheMissTokens(usageView);
  const reply = replyTokens(usageView);
  const hitRate = cacheHitRate(usageView);
  const hitShare = usageView.cacheReadTokens;
  const writeShare = usageView.cacheWriteTokens;
  const missShare = miss;
  const barDenom = hitShare + writeShare + missShare;

  // 按容器宽度决定主行可见个数（测宽条常驻，不因收敛卸载）
  // biome-ignore lint/correctness/useExhaustiveDependencies: total / displayMs / hasTrace 未在函数体读取但刻意保留：内容变化会改变胶囊宽度，需要重新测量
  useLayoutEffect(() => {
    const row = pillsRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    function recompute() {
      if (!row || !measure) return;
      const slots = measure.querySelectorAll<HTMLElement>("[data-usage-slot]");
      for (const el of slots) {
        const id = el.dataset.usageSlot as SlotId | undefined;
        if (!id) continue;
        const w = el.offsetWidth;
        if (w > 0) widthCacheRef.current[id] = w;
      }
      const widths = mainSlotOrder.map((id) => widthCacheRef.current[id] ?? 0);
      if (widths.some((w) => w <= 0)) return;
      const moreEl = measure.querySelector<HTMLElement>("[data-usage-more-measure]");
      const moreW = moreEl?.offsetWidth || MORE_TRIGGER_WIDTH;
      const next = visiblePillCount(widths, row.clientWidth, moreW, PILL_GAP, {
        alwaysReserveMore: hasCopy,
      });
      setVisibleCount((prev) => (prev === next ? prev : next));
    }

    recompute();
    // 只观察主行容器宽度；测宽条随 deps 重跑即可，避免 RO 循环触发
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    ro?.observe(row);
    window.addEventListener("resize", recompute);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [mainSlotOrder, total, displayMs, hasTrace, hasCopy]);

  // 「⋯」菜单：fixed + portal，按触发器上下翻转（坐标未变则不 setState，避免死循环）
  // biome-ignore lint/correctness/useExhaustiveDependencies: overflowKey / total / displayMs 未在函数体读取但刻意保留：触发器位置随内容变化，需要重新定位
  useLayoutEffect(() => {
    if (!moreMenuOpen) {
      setMoreCoords((prev) => (prev == null ? prev : null));
      return;
    }
    function update() {
      const trigger = moreTriggerRef.current;
      const menu = moreMenuRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const mw = menu?.offsetWidth ?? 160;
      const mh = menu?.offsetHeight ?? 48;
      const next = placeMoreMenu(rect, mw, mh);
      setMoreCoords((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.bottom === next.bottom
        ) {
          return prev;
        }
        return next;
      });
    }
    update();
    // 菜单首次挂载后尺寸才准，再测一次
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [moreMenuOpen, overflowKey, total, displayMs]);

  // 滚动时关掉「⋯」菜单（Tokens 明细另有逻辑）
  useEffect(() => {
    if (!moreMenuOpen || open) return;
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && moreMenuRef.current?.contains(t)) return;
      setMoreOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [moreMenuOpen, open]);

  // 打开时按触发器位置重算；缩放时跟随，滚动则关闭（见下：
  useLayoutEffect(() => {
    if (!open) {
      setCoords((prev) => (prev == null ? prev : null));
      return;
    }
    function update() {
      const trigger = pillRef.current;
      if (!trigger) return;
      const next = placeUsagePopover(trigger.getBoundingClientRect());
      setCoords((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.top === next.top &&
          prev.bottom === next.bottom
        ) {
          return prev;
        }
        return next;
      });
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

  // 点击外侧 / Escape 关闭（仅 pill + portal，避免点 Trace 等同条胶囊时不关：
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
    // capture：避免中间层 stopPropagation 导致关不
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 聊天页 keep-alive（hidden）时 portal 仍挂在 body，需在切换页 / 触发器被藏时主动关掉
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

  const popoverStyle: CSSProperties | undefined = coords
    ? {
        left: coords.left,
        width: coords.width,
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
                {t("chat.usage.total", { n: formatUsageTokens(total, usageEstimated) })}
              </span>
            </div>
            {usageEstimated ? (
              <div className="chat-usage-popover__note">{t("chat.usage.estimatedHint")}</div>
            ) : null}

            <div className="chat-usage-group">
              <UsageRow
                label={t("chat.usage.input")}
                value={formatTokenCount(usageView.inputTokens)}
                swatch="input"
              />
              {/* biome-ignore lint/a11y/useSemanticElements: 嵌套用量行用 div + role="group" 聚合，无对应原生控件 */}
              <div className="chat-usage-group__children" role="group">
                <UsageRow
                  label={t("chat.usage.cacheHit")}
                  value={formatTokenCount(usageView.cacheReadTokens)}
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
                  value={formatTokenCount(usageView.cacheWriteTokens)}
                  swatch="write"
                  nested
                />
              </div>
            </div>

            <Separator className="chat-usage-popover__sep" />

            <div className="chat-usage-group">
              <UsageRow
                label={t("chat.usage.output")}
                value={formatTokenCount(usageView.outputTokens)}
                swatch="output"
              />
              {/* biome-ignore lint/a11y/useSemanticElements: 嵌套用量行用 div + role="group" 聚合，无对应原生控件 */}
              <div className="chat-usage-group__children" role="group">
                <UsageRow
                  label={t("chat.usage.reasoning")}
                  value={formatTokenCount(usageView.reasoningTokens)}
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
                    <span className="chat-usage-bar-meter__seg is-hit" style={{ flex: hitShare }} />
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

  /** 主行胶囊。 */
  function renderPill(id: SlotId): ReactNode {
    switch (id) {
      case "tokens":
        return (
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
                {t("chat.usage.tokens")}: {formatUsageTokens(total, usageEstimated)}
              </span>
              <InfoIcon size="sm" className="chat-usage-pill__info" />
            </button>
            {popover}
          </div>
        );
      case "elapsed":
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 静态信息胶囊无交互语义，aria-label 仅用于读屏播报
          <span className="chat-usage-pill is-static" aria-label={t("chat.usage.elapsed")}>
            <ClockIcon size="sm" />
            <span>
              {t("chat.usage.elapsed")}: {formatDurationOrDash(displayMs)}
            </span>
          </span>
        );
      case "trace":
        if (!traceId) return null;
        return onOpenTrace ? (
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
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 静态信息胶囊无交互语义，aria-label 仅用于读屏播报
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
        );
      default:
        return null;
    }
  }

  /** 「⋯」菜单行：统一 chat-usage-action（图标列对齐）。 */
  function renderMenuAction(id: SlotId): ReactNode {
    switch (id) {
      case "copy":
        if (!onCopy) return null;
        return (
          <button
            type="button"
            className="chat-usage-action"
            aria-label={copied ? t("chat.copiedMessage") : t("chat.copyMessage")}
            onClick={() => onCopy()}
          >
            {copied ? <CheckIcon size="sm" /> : <CopyIcon size="sm" />}
            <span>{copied ? t("chat.copiedMessage") : t("chat.copyMessage")}</span>
          </button>
        );
      case "tokens":
        return (
          <div className="chat-usage-pill-wrap">
            <button
              ref={pillRef}
              type="button"
              className={`chat-usage-action${open ? " is-open" : ""}`}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              <DatabaseIcon size="sm" />
              <span>
                {t("chat.usage.tokens")}: {formatUsageTokens(total, usageEstimated)}
              </span>
            </button>
            {popover}
          </div>
        );
      case "elapsed":
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 静态信息胶囊无交互语义，aria-label 仅用于读屏播报
          <span className="chat-usage-action is-static" aria-label={t("chat.usage.elapsed")}>
            <ClockIcon size="sm" />
            <span>
              {t("chat.usage.elapsed")}: {formatDurationOrDash(displayMs)}
            </span>
          </span>
        );
      case "trace":
        if (!traceId) return null;
        return onOpenTrace ? (
          <button
            type="button"
            className="chat-usage-action"
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
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 静态信息胶囊无交互语义，aria-label 仅用于读屏播报
          <span
            className="chat-usage-action is-static"
            aria-label={t("chat.usage.traceAria", { id: traceId })}
            title={traceId}
          >
            <LogsIcon size="sm" />
            <span>
              {t("chat.usage.trace")}: {shortTraceId(traceId)}
            </span>
          </span>
        );
      default:
        return null;
    }
  }

  /** 测宽用静态克隆。 */
  function renderMeasureSlot(id: SlotId): ReactNode {
    switch (id) {
      case "tokens":
        return (
          <span className="chat-usage-pill">
            <DatabaseIcon size="sm" />
            <span>
              {t("chat.usage.tokens")}: {formatUsageTokens(total, usageEstimated)}
            </span>
            <InfoIcon size="sm" className="chat-usage-pill__info" />
          </span>
        );
      case "elapsed":
        return (
          <span className="chat-usage-pill is-static">
            <ClockIcon size="sm" />
            <span>
              {t("chat.usage.elapsed")}: {formatDurationOrDash(displayMs)}
            </span>
          </span>
        );
      case "trace":
        if (!traceId) return null;
        return (
          <span className="chat-usage-pill">
            <LogsIcon size="sm" />
            <span>
              {t("chat.usage.trace")}: {shortTraceId(traceId)}
            </span>
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div
      className={`chat-usage-bar${variant === "message" ? " chat-usage-bar--message" : ""}`}
      ref={rootRef}
    >
      <div className="chat-usage-bar__measure" ref={measureRef} aria-hidden="true">
        {mainSlotOrder.map((id) => (
          <div key={id} className="chat-usage-bar__slot" data-usage-slot={id}>
            {renderMeasureSlot(id)}
          </div>
        ))}
        <button
          type="button"
          className="chat-usage-more__trigger"
          data-usage-more-measure=""
          tabIndex={-1}
        >
          <MoreDots />
        </button>
      </div>
      <div className="chat-usage-bar__pills" ref={pillsRef}>
        {visibleIds.map((id) => (
          <div key={id} className="chat-usage-bar__slot">
            {renderPill(id)}
          </div>
        ))}
        {showMore ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: 「⋯」触区的悬停 / 聚焦展开逻辑，交互由内部按钮承担
          <div
            className={`chat-usage-more${moreMenuOpen ? " is-open" : ""}`}
            ref={moreWrapRef}
            onMouseEnter={openMoreMenu}
            onMouseLeave={scheduleCloseMoreMenu}
            onFocus={openMoreMenu}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && moreMenuRef.current?.contains(next)) return;
              scheduleCloseMoreMenu();
            }}
          >
            <button
              ref={moreTriggerRef}
              type="button"
              className="chat-usage-more__trigger"
              aria-label={t("chat.usage.more")}
              aria-expanded={moreMenuOpen}
              aria-controls={moreMenuId}
              aria-haspopup="menu"
            >
              <MoreDots />
            </button>
          </div>
        ) : null}
      </div>
      {moreMenuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={moreMenuRef}
              id={moreMenuId}
              className="chat-usage-more__menu"
              role="menu"
              aria-label={t("chat.usage.more")}
              style={
                moreCoords
                  ? {
                      left: moreCoords.left,
                      ...(moreCoords.top != null ? { top: moreCoords.top } : {}),
                      ...(moreCoords.bottom != null ? { bottom: moreCoords.bottom } : {}),
                    }
                  : { visibility: "hidden" as const }
              }
              onMouseEnter={openMoreMenu}
              onMouseLeave={scheduleCloseMoreMenu}
            >
              {overflowIds.map((id) => (
                <div key={id} className="chat-usage-more__item" role="none">
                  {renderMenuAction(id)}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
