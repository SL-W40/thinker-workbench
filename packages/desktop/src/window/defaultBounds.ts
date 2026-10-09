/**
 * 主窗口默认尺寸与恢复时的显示器适配。
 *
 * 首启按主屏工作区比例计算；恢复时将几何夹到最近显示器的可见 workArea。
 */
import { screen } from "electron";
import type { SessionWindow } from "../config/sessionStore";

/** 目标宽度占工作区比例。 */
const TARGET_WIDTH_RATIO = 0.72;
/** 目标高度占工作区比例。 */
const TARGET_HEIGHT_RATIO = 0.78;
/** 大屏上宽度上限，保持紧凑。 */
const MAX_WIDTH = 1280;
/** 大屏上高度上限。 */
const MAX_HEIGHT = 900;
/** 首选最小宽度（小屏会再下调）。 */
const PREFERRED_MIN_WIDTH = 720;
/** 首选最小高度。 */
const PREFERRED_MIN_HEIGHT = 520;
/** 相对工作区边缘的留白。 */
const EDGE_PAD = 48;

/** 将数值限制在 [min, max]。 */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * 在给定工作区内仍能放下的最小窗口尺寸（小屏 / 高 DPI 缩放）。
 */
export function windowMinSize(
  workWidth: number,
  workHeight: number,
): { minWidth: number; minHeight: number } {
  return {
    minWidth: Math.max(320, Math.min(PREFERRED_MIN_WIDTH, workWidth)),
    minHeight: Math.max(280, Math.min(PREFERRED_MIN_HEIGHT, workHeight)),
  };
}

/**
 * 按主屏工作区计算首启 / 回退尺寸：
 * 约 72% × 78% 可用区域，并设上限以免大显示器上窗口过大。
 */
export function computeDefaultWindowSize(): Pick<SessionWindow, "width" | "height"> {
  const { width: aw, height: ah } = screen.getPrimaryDisplay().workAreaSize;
  const { minWidth, minHeight } = windowMinSize(aw, ah);
  const maxW = Math.max(minWidth, Math.min(MAX_WIDTH, aw - EDGE_PAD));
  const maxH = Math.max(minHeight, Math.min(MAX_HEIGHT, ah - EDGE_PAD));
  return {
    width: clamp(Math.round(aw * TARGET_WIDTH_RATIO), minWidth, maxW),
    height: clamp(Math.round(ah * TARGET_HEIGHT_RATIO), minHeight, maxH),
  };
}

/**
 * 将恢复的窗口几何限制到可见显示器上，并符合该屏的 min/max。
 * 无坐标时以光标所在屏为参考。
 */
export function fitWindowToDisplay(window: SessionWindow): SessionWindow {
  const point =
    typeof window.x === "number" && typeof window.y === "number"
      ? { x: window.x, y: window.y }
      : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const { minWidth, minHeight } = windowMinSize(workArea.width, workArea.height);
  const width = clamp(window.width, minWidth, workArea.width);
  const height = clamp(window.height, minHeight, workArea.height);

  let x = window.x;
  let y = window.y;
  if (typeof x === "number" && typeof y === "number") {
    x = clamp(x, workArea.x, workArea.x + workArea.width - width);
    y = clamp(y, workArea.y, workArea.y + workArea.height - height);
  }

  return {
    width,
    height,
    maximized: window.maximized,
    x,
    y,
  };
}
