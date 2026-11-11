/**
 * Electron 页面缩放会改 `devicePixelRatio` 并触发 resize。
 * 这段时间给 `<html>` 加上 `is-page-zoom`，Changes 的 diff 行据此关掉
 * `content-visibility: auto`，避免缩放途中被当成屏外、先空一帧再画上。
 */

const HOLD_MS = 200;

let lastDpr = window.devicePixelRatio;
let timer = 0;

function onResize(): void {
  const dpr = window.devicePixelRatio;
  if (dpr === lastDpr) return;
  lastDpr = dpr;
  document.documentElement.classList.add("is-page-zoom");
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    document.documentElement.classList.remove("is-page-zoom");
  }, HOLD_MS);
}

/** 应用生命周期内挂一次即可。入口 HMR 会重跑模块，监听不能叠两份。 */
export function watchPageZoom(): void {
  const g = globalThis as typeof globalThis & { __twPageZoom?: boolean };
  if (g.__twPageZoom) return;
  g.__twPageZoom = true;
  window.addEventListener("resize", onResize);
}
