/**
 * 浏览器视图几何：离屏占位与 bounds 应用。
 */
import type { BrowserBounds } from "@thinker-workbench/shared";
import type { BrowserWindow, WebContentsView } from "electron";
import { FALLBACK_VIEWPORT_H, FALLBACK_VIEWPORT_W } from "./browserConstants";

/** 不可见截图 / 求值用的离屏矩形（不挂载）。 */
export function captureBounds(bounds: BrowserBounds): Electron.Rectangle {
  const width = bounds.width >= 2 ? bounds.width : FALLBACK_VIEWPORT_W;
  const height = bounds.height >= 2 ? bounds.height : FALLBACK_VIEWPORT_H;
  return { x: -10_000, y: -10_000, width, height };
}

/**
 * 按「可见 / 空白 / 锁定」计算 view 与 overlay 的 bounds。
 * 不可见或（空白且未锁定）时返回 null，表示必须摘除（否则会吞输入）。
 */
export function viewBoundsFor(args: {
  visible: boolean;
  blank: boolean;
  locked: boolean;
  measured: boolean;
  bounds: BrowserBounds;
}): { view: Electron.Rectangle | null; overlay: Electron.Rectangle } {
  if (!args.visible || (args.blank && !args.locked)) {
    return { view: null, overlay: { x: 0, y: 0, width: 0, height: 0 } };
  }
  const view: Electron.Rectangle = args.measured
    ? { ...args.bounds }
    : { x: -10_000, y: -10_000, width: FALLBACK_VIEWPORT_W, height: FALLBACK_VIEWPORT_H };
  // 蒙层只在锁定 + 可见 + 已量洞时铺满
  const overlay: Electron.Rectangle =
    args.locked && args.visible && args.measured
      ? { ...args.bounds }
      : { x: 0, y: 0, width: 0, height: 0 };
  return { view, overlay };
}

/** 把算好的 bounds 落到两个视图上（null 表示不动）。 */
export function applyViewBounds(
  view: WebContentsView | null,
  overlay: WebContentsView | null,
  next: ReturnType<typeof viewBoundsFor>,
): void {
  if (view && next.view) view.setBounds(next.view);
  if (overlay) overlay.setBounds(next.overlay);
}

/** 重新置顶蒙层（已在树上时先摘后挂）。 */
export function raiseOverlay(win: BrowserWindow, overlay: WebContentsView): void {
  win.contentView.removeChildView(overlay);
  win.contentView.addChildView(overlay);
}
