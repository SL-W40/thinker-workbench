/**
 * 等待主文档加载落定（did-stop-loading / 主框架失败 / 超时）。
 */
import type { WebContents } from "electron";
import { LOAD_SETTLE_TIMEOUT_MS } from "./browserConstants";

export function waitForLoadSettle(
  wc: WebContents,
  timeoutMs: number = LOAD_SETTLE_TIMEOUT_MS,
): Promise<void> {
  if (wc.isDestroyed() || !wc.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wc.removeListener("did-stop-loading", onStop);
      wc.removeListener("did-fail-load", onFail);
      resolve();
    };
    const onStop = () => finish();
    const onFail = (
      _e: Electron.Event,
      _code: number,
      _desc: string,
      _url: string,
      isMainFrame: boolean,
    ) => {
      if (isMainFrame) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    wc.once("did-stop-loading", onStop);
    wc.once("did-fail-load", onFail);
  });
}
