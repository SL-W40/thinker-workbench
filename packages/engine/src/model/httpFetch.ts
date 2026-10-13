/**
 * 模型 API 用的 fetch：按 HTTP 兼容模式选择是否允许 HTTP/2。
 * 企业代理 / VPN 下 HTTP/2 异常时可降为 HTTP/1.1。
 */
import {
  DEFAULT_HTTP_COMPATIBILITY_MODE,
  type HttpCompatibilityMode,
  normalizeHttpCompatibilityMode,
} from "@thinker-workbench/shared";
import { Agent, type RequestInit as UndiciRequestInit, fetch as undiciFetch } from "undici";

/** 当前兼容模式。 */
let mode: HttpCompatibilityMode = DEFAULT_HTTP_COMPATIBILITY_MODE;

const agentHttp2 = new Agent({ allowH2: true, keepAliveTimeout: 60_000 });
const agentHttp1 = new Agent({ allowH2: false, keepAliveTimeout: 60_000 });

/** 应用桌面 Settings 下发的 HTTP 兼容模式。 */
export function configureHttpCompatibilityMode(value?: HttpCompatibilityMode | null): void {
  mode = normalizeHttpCompatibilityMode(value, DEFAULT_HTTP_COMPATIBILITY_MODE);
}

/** 当前模式（供探测 / 日志）。 */
export function getHttpCompatibilityMode(): HttpCompatibilityMode {
  return mode;
}

/** 带兼容模式的 fetch（流式 body 与全局 fetch 行为一致）。 */
export function modelFetch(
  url: string,
  init: UndiciRequestInit & { signal?: AbortSignal },
): ReturnType<typeof undiciFetch> {
  const dispatcher = mode === "http1" ? agentHttp1 : agentHttp2;
  return undiciFetch(url, { ...init, dispatcher });
}
