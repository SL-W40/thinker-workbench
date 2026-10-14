/**
 * 锚点浮层：Portal 到 body，随滚动 / 缩放重算位置。
 * 点外侧、Escape、hash 变化、锚点被 hidden 时关闭。
 */
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type AnchorRect,
  type PlacePopoverResult,
  type PopoverAlign,
  type PopoverPlacement,
  placePopover,
} from "../../overlay/place";
import { eventInOverlay, OverlayScopeContext } from "../../overlay/scope";

export type { PopoverAlign, PopoverPlacement };

/** 只读锚点，兼容按钮 ref（current 更窄）。 */
export type AnchorHandle = {
  readonly current: HTMLElement | null;
};

export type PopoverProps = {
  /** 是否打开。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 触发器。打开时按其矩形定位。 */
  anchorRef?: AnchorHandle;
  /** 无 ref 时的锚点：右键坐标，或已量好的矩形。 */
  anchor?: { x: number; y: number } | DOMRect | null;
  /** 垂直方向。默认 auto（空间不够就翻到另一侧）。 */
  placement?: PopoverPlacement;
  /** 水平对齐。默认 start。 */
  align?: PopoverAlign;
  /** 与锚点的间距。默认 4。 */
  gap?: number;
  /** 至少与锚点同宽。 */
  matchAnchorWidth?: boolean;
  /** 面板角色。dialog 时带表面样式。 */
  role?: "dialog" | "menu" | "listbox";
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 点外侧关闭。默认 true。 */
  closeOnOutside?: boolean;
  /** Escape 关闭。默认 true。 */
  closeOnEscape?: boolean;
  /** 追加 class。 */
  className?: string;
  children: ReactNode;
};

function toAnchorRect(
  anchorRef: AnchorHandle | undefined,
  anchor: PopoverProps["anchor"],
): AnchorRect | null {
  const el = anchorRef?.current;
  if (el && el.isConnected) {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  if (!anchor) return null;
  if (anchor instanceof DOMRect) {
    return { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height };
  }
  return { left: anchor.x, top: anchor.y, width: 0, height: 0 };
}

export function Popover({
  open,
  onClose,
  anchorRef,
  anchor,
  placement = "auto",
  align = "start",
  gap = 4,
  matchAnchorWidth = false,
  role,
  "aria-label": ariaLabel,
  closeOnOutside = true,
  closeOnEscape = true,
  className,
  children,
}: PopoverProps) {
  const overlayId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<PlacePopoverResult | null>(null);
  const chrome = role === "dialog";

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const box = toAnchorRect(anchorRef, anchor);
    const panel = panelRef.current;
    if (!box || !panel) return;
    const width = matchAnchorWidth ? Math.max(box.width, panel.offsetWidth) : panel.offsetWidth;
    const next = placePopover({
      anchor: box,
      size: { width, height: panel.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      placement,
      align,
      gap,
    });
    setCoords((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.maxHeight === next.maxHeight &&
        prev.placement === next.placement
      ) {
        return prev;
      }
      return next;
    });
  }, [open, anchor, anchorRef, placement, align, gap, matchAnchorWidth, coords]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const box = toAnchorRect(anchorRef, anchor);
      const panel = panelRef.current;
      if (!box || !panel) return;
      const width = matchAnchorWidth ? Math.max(box.width, panel.offsetWidth) : panel.offsetWidth;
      const next = placePopover({
        anchor: box,
        size: { width, height: panel.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        placement,
        align,
        gap,
      });
      setCoords((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.maxHeight === next.maxHeight &&
          prev.placement === next.placement
        ) {
          return prev;
        }
        return next;
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, anchorRef, placement, align, gap, matchAnchorWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!closeOnOutside) return;
      if (anchorRef?.current?.contains(event.target as Node)) return;
      if (eventInOverlay(event.target, overlayId, panelRef.current)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onHash = () => onClose();
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
    };
  }, [open, onClose, closeOnOutside, closeOnEscape, overlayId, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const el = anchorRef?.current;
    if (!el) return;
    const closeIfHidden = () => {
      if (!el.isConnected || el.closest("[hidden]")) onClose();
    };
    const observer = new MutationObserver(closeIfHidden);
    let node: Element | null = el;
    while (node) {
      observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
      node = node.parentElement;
    }
    closeIfHidden();
    return () => observer.disconnect();
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;
  if (!anchorRef?.current && !anchor) return null;

  const anchorMinWidth = matchAnchorWidth ? anchorRef?.current?.offsetWidth : undefined;
  const style: CSSProperties = coords
    ? {
        left: coords.left,
        top: coords.top,
        maxHeight: coords.maxHeight,
        minWidth: anchorMinWidth,
      }
    : { left: 0, top: 0, visibility: "hidden", minWidth: anchorMinWidth };

  const cls = ["tw-popover", chrome ? "tw-popover--chrome" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      ref={panelRef}
      className={cls}
      style={style}
      role={role}
      aria-label={ariaLabel}
      data-tw-overlay={overlayId}
    >
      <OverlayScopeContext.Provider value={overlayId}>{children}</OverlayScopeContext.Provider>
    </div>,
    document.body,
  );
}
