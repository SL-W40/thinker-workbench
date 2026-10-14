/**
 * 视口内浮层定位：上下翻转、左右钳制。不含 DOM，便于单测。
 */

export type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type PopoverPlacement = "auto" | "bottom" | "top";
export type PopoverAlign = "start" | "center" | "end";

export type PlacePopoverInput = {
  anchor: AnchorRect;
  /** 浮层当前宽高。 */
  size: { width: number; height: number };
  viewport: ViewportSize;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  /** 与锚点的间距。默认 4。 */
  gap?: number;
  /** 距视口边缘的留白。默认 8。 */
  pad?: number;
  /** 最大高度上限。默认 320。 */
  maxHeightCap?: number;
};

export type PlacePopoverResult = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

const GAP = 4;
const PAD = 8;
const MAX_H = 320;
/** 空间极小时仍给菜单一条可滚动的最小高度。 */
const MIN_MAX_H = 80;

/** 把浮层放在锚点上方或下方，并钳在视口内。 */
export function placePopover(input: PlacePopoverInput): PlacePopoverResult {
  const gap = input.gap ?? GAP;
  const pad = input.pad ?? PAD;
  const align = input.align ?? "start";
  const cap = input.maxHeightCap ?? MAX_H;
  const { anchor, size, viewport } = input;

  const spaceBelow = viewport.height - (anchor.top + anchor.height) - gap - pad;
  const spaceAbove = anchor.top - gap - pad;
  const want = Math.min(size.height, cap);

  let placement: "top" | "bottom";
  if (input.placement === "top") placement = "top";
  else if (input.placement === "bottom") placement = "bottom";
  else placement = spaceBelow >= want || spaceBelow >= spaceAbove ? "bottom" : "top";

  const available = Math.max(0, placement === "bottom" ? spaceBelow : spaceAbove);
  const maxHeight = Math.max(MIN_MAX_H, Math.min(cap, available || MIN_MAX_H));
  const usedHeight = Math.min(size.height, maxHeight);

  // 垂直方向只贴着锚点，不把浮层拽到视口顶（锚点在滚动区外时仍跟着走）。
  const top =
    placement === "bottom" ? anchor.top + anchor.height + gap : anchor.top - gap - usedHeight;

  let left = anchor.left;
  if (align === "end") left = anchor.left + anchor.width - size.width;
  else if (align === "center") left = anchor.left + (anchor.width - size.width) / 2;

  const maxLeft = Math.max(pad, viewport.width - pad - size.width);
  if (left < pad) left = pad;
  if (left > maxLeft) left = maxLeft;

  return { left: round(left), top: round(top), maxHeight: round(maxHeight), placement };
}

export type PlaceBesideResult = {
  left: number;
  top: number;
  maxHeight: number;
  side: "left" | "right";
};

/** 把子菜单放在锚点左侧或右侧。 */
export function placeBeside(input: {
  anchor: AnchorRect;
  size: { width: number; height: number };
  viewport: ViewportSize;
  gap?: number;
  pad?: number;
  maxHeightCap?: number;
}): PlaceBesideResult {
  const gap = input.gap ?? GAP;
  const pad = input.pad ?? PAD;
  const cap = input.maxHeightCap ?? MAX_H;
  const { anchor, size, viewport } = input;

  const spaceRight = viewport.width - (anchor.left + anchor.width) - gap - pad;
  const spaceLeft = anchor.left - gap - pad;
  const side: "left" | "right" =
    spaceRight >= size.width || spaceRight >= spaceLeft ? "right" : "left";

  let left =
    side === "right" ? anchor.left + anchor.width + gap : anchor.left - gap - size.width;
  const maxLeft = Math.max(pad, viewport.width - pad - size.width);
  if (left < pad) left = pad;
  if (left > maxLeft) left = maxLeft;

  // 锚点滚出视口时仍贴着它，避免子菜单被单独拽到屏幕边缘。
  const panelHeight = Math.min(size.height, cap);
  const anchorInView = anchor.top + anchor.height > pad && anchor.top < viewport.height - pad;
  let top = anchor.top;
  if (anchorInView) {
    const overflowBelow = top + panelHeight + pad - viewport.height;
    if (overflowBelow > 0) top -= overflowBelow;
    if (top < pad) top = pad;
  }

  const roomBelow = viewport.height - pad - top;
  const maxHeight = Math.max(MIN_MAX_H, Math.min(cap, anchorInView ? roomBelow : panelHeight));
  return { left: round(left), top: round(top), maxHeight: round(maxHeight), side };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
