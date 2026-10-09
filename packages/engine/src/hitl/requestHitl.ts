/**
 * HITL：向主进程发起用户介入请求，挂起直到答复或 cancel。
 */
import { createId, type HitlRequest, type HitlResponse } from "@thinker-workbench/shared";
import { postToParent } from "../host/port";
import { getRunIds } from "../runtime/runEmit";

type Pending = {
  resolve: (response: HitlResponse) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();

/** 主进程 hitlResult 到达时调用。 */
export function resolveHitl(response: HitlResponse): void {
  const p = pending.get(response.hitlId);
  if (!p) return;
  pending.delete(response.hitlId);
  p.resolve(response);
}

/** cancel 时拒绝全部挂起的 HITL。 */
export function rejectAllHitl(reason = "Run cancelled."): void {
  for (const [id, p] of pending) {
    pending.delete(id);
    p.reject(new Error(reason));
  }
}

/**
 * 请求用户介入；Promise 在答复后 resolve。
 * 会向主进程发送 `kind: "hitl"`，由 bridge 转成 AgentEvent。
 */
export function requestHitl(
  partial: Omit<HitlRequest, "hitlId" | "threadId" | "runId"> & {
    threadId?: string;
    runId?: string;
  },
  signal?: AbortSignal,
): Promise<HitlResponse> {
  const ids = getRunIds();
  const hitlId = createId("hitl");
  const request: HitlRequest = {
    hitlId,
    kind: partial.kind,
    threadId: partial.threadId ?? ids?.threadId ?? "",
    runId: partial.runId ?? ids?.runId ?? "",
    title: partial.title,
    body: partial.body,
    payload: partial.payload,
    actions: partial.actions,
  };

  return new Promise<HitlResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Run cancelled."));
      return;
    }
    const onAbort = () => {
      pending.delete(hitlId);
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    pending.set(hitlId, {
      resolve: (response) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(response);
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    });

    postToParent({ channel: "utility", kind: "hitl", request });
  });
}
