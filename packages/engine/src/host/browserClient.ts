/**
 * Engine → main 内置浏览器请求客户端（requestId 往返）。
 */
import {
  createId,
  type BrowserRequestAction,
  type UtilityBrowserEvent,
  type UtilityBrowserRequest,
} from "@thinker-workbench/shared";
import { getRunIds } from "../runtime/runEmit";
import { postToParent } from "./port";

type Pending = {
  resolve: (event: UtilityBrowserEvent) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();

/** 主进程 browserEvent 到达。 */
export function handleBrowserEvent(event: UtilityBrowserEvent): void {
  const p = pending.get(event.requestId);
  if (!p) return;
  pending.delete(event.requestId);
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
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

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
    });

    postToParent(req);
  });
}
