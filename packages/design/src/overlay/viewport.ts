/**
 * UI 缩放（CSS zoom）下的坐标换算。
 *
 * 背景：宿主在 `html` 上打了内联 `zoom`（见 renderer 的 `applyUiFontScale`），
 * 浏览器会先把布局坐标整体放大 zoom 倍再绘制。于是同一段定位逻辑里混着两套坐标：
 *
 * - **视觉 px**：`getBoundingClientRect()`、`clientX/clientY`、`window.innerWidth/Height`。
 *   已经是「人眼看到的」数值，含 zoom。
 * - **布局 px**：`offsetWidth/Height`、`clientWidth/Height`，以及 `position: fixed`
 *   的 `left/top` —— 写进去后还会被 zoom 再乘一次才落到屏幕上。
 *
 * 浮层一律是 `position: fixed` + Portal，定位值必须落在**布局 px**；
 * 而锚点位置来自 `getBoundingClientRect()`（**视觉 px**）。直接相加就会整体偏移
 * zoom 倍，且倍率越大偏得越远 —— 这正是缩放后悬停 / 点击浮层错位的成因。
 *
 * 约定：摆放计算统一在布局 px 里做；本模块负责把视觉 px 折回布局 px。
 * 未启用缩放时 zoom 恒为 1，全部换算退化为原值，行为与缩放前完全一致。
 */
import type { AnchorRect, ViewportSize } from "./place";

const DEFAULT_ZOOM = 1;

/**
 * 当前生效的界面缩放倍数。
 * 读 `--tw-zoom`（`applyUiFontScale` 与 zoom 同步写入），缺失时按 1 处理，
 * 因此组件库独立运行（预览 / 单测）时不受影响。
 */
export function readUiZoom(): number {
  if (typeof document === "undefined" || typeof window === "undefined") return DEFAULT_ZOOM;
  const root = document.documentElement;
  const custom = getComputedStyle(root).getPropertyValue("--tw-zoom").trim();
  const parsed = Number.parseFloat(custom || root.style.zoom);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ZOOM;
}

/** 视觉 px → 布局 px（缩放未启用时原值返回）。 */
export function toLayoutValue(value: number, zoom = readUiZoom()): number {
  return zoom === DEFAULT_ZOOM ? value : value / zoom;
}

/** `getBoundingClientRect()` 的视觉矩形 → 布局矩形。 */
export function toLayoutRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): AnchorRect {
  const zoom = readUiZoom();
  if (zoom === DEFAULT_ZOOM) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  return {
    left: rect.left / zoom,
    top: rect.top / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
}

/**
 * 布局 px 口径的视口尺寸。
 * `window.innerWidth/Height` 是视觉 px，必须除回 zoom 才能与布局坐标相加减，
 * 否则「剩余空间够不够翻转」「右边缘钳制」这些判断会整体放大 zoom 倍而失效。
 */
export function getLayoutViewport(): ViewportSize {
  const zoom = readUiZoom();
  if (zoom === DEFAULT_ZOOM) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: window.innerWidth / zoom, height: window.innerHeight / zoom };
}
