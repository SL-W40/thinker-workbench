/**
 * 内置浏览器桥接 + 打开面板事件。
 */
import type { BrowserBounds, BrowserEvent, BrowserState } from "@thinker-workbench/shared";

export const OPEN_BROWSER_EVENT = "tw:open-browser";

export type OpenBrowserDetail = {
  url?: string;
};

/** 面板尚未挂载时暂存，mount 后由 RightInspector 消费。 */
let pendingOpen: OpenBrowserDetail | null = null;

/** 取出并清空待打开详情。 */
export function consumePendingOpenBrowser(): OpenBrowserDetail | null {
  const next = pendingOpen;
  pendingOpen = null;
  return next;
}

/** 请求打开右侧 Browser 面板（可选导航）。 */
export function requestOpenBrowser(detail?: string | OpenBrowserDetail): void {
  const payload: OpenBrowserDetail =
    typeof detail === "string" ? { url: detail } : (detail ?? {});
  pendingOpen = payload;
  window.dispatchEvent(new CustomEvent(OPEN_BROWSER_EVENT, { detail: payload }));
}

function api() {
  return window.thinker?.browser;
}

export async function browserGetState(): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.getState();
}

export async function browserNavigate(url: string): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.navigate(url);
}

export async function browserGoBack(): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.goBack();
}

export async function browserGoForward(): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.goForward();
}

export async function browserReload(): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.reload();
}

export async function browserSetBounds(bounds: BrowserBounds): Promise<void> {
  const browser = api();
  if (!browser) return;
  await browser.setBounds(bounds);
}

export async function browserSetVisible(visible: boolean): Promise<void> {
  const browser = api();
  if (!browser) return;
  await browser.setVisible(visible);
}

export async function browserTakeControl(): Promise<BrowserState | null> {
  const browser = api();
  if (!browser) return null;
  return browser.takeControl();
}

export function onBrowserEvent(cb: (event: BrowserEvent) => void): () => void {
  const browser = api();
  if (!browser) return () => undefined;
  return browser.onEvent(cb);
}

/** 判断是否应在内置浏览器打开（http/https）。 */
export function isBrowserableUrl(href: string): boolean {
  const h = href.trim();
  if (!h || h.startsWith("#")) return false;
  if (h.startsWith("mailto:") || h.startsWith("tel:")) return false;
  try {
    const u = new URL(h, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return /^https?:\/\//i.test(h) || /^www\./i.test(h);
  }
}
