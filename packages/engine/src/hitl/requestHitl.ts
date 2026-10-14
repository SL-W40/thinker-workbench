/**
 * HITL：向主进程发起用户介入请求，挂起直到答复或 cancel。
 * pending 按 runId 索引，cancel 只拒本 run。
 */
import { createId, type HitlRequest, type HitlResponse } from "@thinker-workbench/shared";
import { postToParent } from "../host/port";
import { getRunContext } from "../runtime/runContext";
import { getRunIds } from "../runtime/runEmit";

type Pending = {
  runId: string;
  resolve: (response: HitlResponse) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();

/** 主进程 hitlResult 到达时调用。 */
export function resolveHitl(response: HitlResponse): void {
  const p = pending.get(response.hitlId);
  if (!p) return;
  pending.delete(response.hitlId);
  const ctx = getRunContext();
  ctx?.hitlIds.delete(response.hitlId);
  p.resolve(response);
}

/** 仅拒绝指定 run 的挂起 HITL。 */
export function rejectHitlByRunId(runId: string, reason = "Run cancelled."): void {
  const id = runId?.trim();
  if (!id) return;
  for (const [hitlId, p] of pending) {
    if (p.runId !== id) continue;
    pending.delete(hitlId);
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
  const runId = partial.runId ?? ids?.runId ?? "";
  const request: HitlRequest = {
    hitlId,
    kind: partial.kind,
    threadId: partial.threadId ?? ids?.threadId ?? "",
    runId,
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
      getRunContext()?.hitlIds.delete(hitlId);
      reject(new Error("Run cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    pending.set(hitlId, {
      runId,
      resolve: (response) => {
        signal?.removeEventListener("abort", onAbort);
        getRunContext()?.hitlIds.delete(hitlId);
        resolve(response);
      },
      reject: (err) => {
        signal?.removeEventListener("abort", onAbort);
        getRunContext()?.hitlIds.delete(hitlId);
        reject(err);
      },
    });
    getRunContext()?.hitlIds.add(hitlId);

    postToParent({ channel: "utility", kind: "hitl", request });
  });
}
