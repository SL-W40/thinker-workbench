/**
 * 内置浏览器常量。
 */

/** UI 未上报尺寸前的占位（CSS px）。 */
export const FALLBACK_VIEWPORT_W = 1280;
export const FALLBACK_VIEWPORT_H = 720;
/** 等待主文档加载落定的上限。 */
export const LOAD_SETTLE_TIMEOUT_MS = 30_000;
/**
 * 单次截图（capturePage）上限。
 * 未绘制过的页面 capturePage 可能一直不返回，必须兜底超时。
 */
export const CAPTURE_TIMEOUT_MS = 8_000;
/** 请求渲染层开面板后，等待 <webview> 挂载的上限。 */
export const ATTACH_WAIT_MS = 8_000;
