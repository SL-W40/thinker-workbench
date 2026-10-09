/**
 * 渲染进程 Content-Security-Policy（CSP）配置与注入。
 *
 * 打包与开发策略不同：开发需允许 Vite HMR 的 unsafe-eval 与本地 origin；
 * 打包侧去掉 unsafe-eval 以消除 Electron 安全警告。
 *
 * Logs 由工具窗同进程挂载，产品壳不再 iframe 嵌入，故无 frame-src。
 */
import { app, session } from "electron";
import { DEV_RENDERER_URL } from "../config/paths";

/** 应用渲染进程 Vite HMR WebSocket。 */
const DEV_WS = "ws://127.0.0.1:5179";

/**
 * 打包后渲染进程的 CSP 字符串。
 * 不含 `unsafe-eval`，避免 Electron 的 CSP 安全警告。
 */
export function packagedContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // index.html 启动闪屏含少量内联脚本
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // 聊天 Markdown 可含外链图片（https/http）；脚本仍限 self
    "img-src 'self' data: blob: https: http:",
    // 工作空间音视频预览走 data URL
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

/**
 * 开发 / 未打包时的 CSP 字符串。
 * Vite HMR 需要 `unsafe-eval` 与本地 origin；因此未打包时 Electron 仍可能打印 CSP 警告。
 */
export function developmentContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${DEV_RENDERER_URL}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${DEV_RENDERER_URL} ${DEV_WS}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

/**
 * 按是否打包选择 CSP。
 * @param isPackaged 默认取 `app.isPackaged`
 */
export function contentSecurityPolicy(isPackaged = app.isPackaged): string {
  return isPackaged ? packagedContentSecurityPolicy() : developmentContentSecurityPolicy();
}

/**
 * 在 defaultSession 上拦截响应头，统一注入 CSP。
 * 会移除响应中已有的 Content-Security-Policy，再写入本模块策略。
 */
export function applyContentSecurityPolicy(): void {
  const policy = contentSecurityPolicy();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
      if (key.toLowerCase() === "content-security-policy") continue;
      headers[key] = Array.isArray(value) ? value : [String(value)];
    }
    headers["Content-Security-Policy"] = [policy];
    callback({ responseHeaders: headers });
  });
}
