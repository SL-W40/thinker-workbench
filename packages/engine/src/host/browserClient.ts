/**
 * Engine → main 内置浏览器请求客户端（requestId 往返）。
 */
import {
  type BrowserRequestAction,
  createId,
  type UtilityBrowserEvent,
  type UtilityBrowserRequest,
} from "@thinker-workbench/shared";
import { getRunIds } from "../runtime/runEmit";
import { getAllowAiBrowser } from "../workspace";
import { postToParent } from "./port";

type Pending = {
  resolve: (event: UtilityBrowserEvent) => void;
  reject: (err: Error) => void;
  /** 兜底超时：主进程不回应时也必须还给模型一个错误，否则整个 run 卡死。 */
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

/**
 * 单次浏览器动作的等待上限。
 * 主进程正常会 reply（成功或错误），这里的超时只兜「没人回」：面板没起来、
 * 渲染进程卡住、utility ↔ main 通道断掉。
 */
export const BROWSER_CALL_TIMEOUT_MS = 45_000;

/** 主进程 browserEvent 到达。 */
export function handleBrowserEvent(event: UtilityBrowserEvent): void {
  const p = pending.get(event.requestId);
  if (!p) return;
  pending.delete(event.requestId);
  clearTimeout(p.timer);
  if (event.phase === "error") {
    p.reject(new Error(event.error || "Browser error"));
    return;
  }
  p.resolve(event);
}

export type BrowserCallResult = {
  output: string;
  screenshotPath?: string;
};

/** 发起一次浏览器动作并等待 result。 */
export function browserCall(
  action: BrowserRequestAction,
  fields: Omit<
    UtilityBrowserRequest,
    "channel" | "kind" | "requestId" | "action" | "runId" | "threadId"
  > = {},
  signal?: AbortSignal,
): Promise<BrowserCallResult> {
  if (!getAllowAiBrowser()) {
    return Promise.reject(
      new Error(
        "Browser tools are disabled in Settings (Browser protection). Ask the user to turn protection off if browser automation is required.",
      ),
    );
  }
  const requestId = createId("browser");
  const ids = getRunIds();
  const req: UtilityBrowserRequest = {
    channel: "utility",
    kind: "browserRequest",
    requestId,
    action,
    runId: ids?.runId,
    threadId: ids?.threadId,
    ...fields,
  };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Run cancelled."));
      return;
    }
    const onAbort = () => {
      pending.delete(requestId);
      clearTimeout(timer);
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      signal?.removeEventListener("abort", onAbort);
      reject(
        new Error(
          `Browser did not respond within ${Math.round(BROWSER_CALL_TIMEOUT_MS / 1000)}s ` +
            "(the panel may be closed, or the page is busy). " +
            "Open the Browser panel and retry, or call browser_navigate first.",
        ),
      );
    }, BROWSER_CALL_TIMEOUT_MS);

    pending.set(requestId, {
      resolve: (event) => {
        signal?.removeEventListener("abort", onAbort);
        resolve({
          output: event.output ?? "",
          screenshotPath: event.screenshotPath,
        });
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
      timer,
    });

    postToParent(req);
  });
}
