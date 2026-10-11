/**
 * localhost 链接策略：设置关闭「在内置 Browser 打开」时改用系统浏览器。
 */
import { shell } from "electron";
import { getGeneralSettings } from "../config/settingsStore";

/** 是否为 localhost / 环回地址上的 http(s) 链接。 */
export function isLocalHostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * 若为本地链接且用户关闭了「在内置浏览器打开本地链接」，则用系统默认浏览器打开。
 * @returns 已改走系统浏览器时为 true（调用方勿再进内置 Browser）
 */
export function maybeOpenLocalLinkExternally(url: string): boolean {
  if (!isLocalHostUrl(url)) return false;
  if (getGeneralSettings().openLocalLinksInBrowser) return false;
  void shell.openExternal(url).catch(() => {
    /* 系统无法打开时忽略 */
  });
  return true;
}
